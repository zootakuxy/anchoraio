import {ServerOptions} from "./opts";
import {AioSocket} from "../aio/socket";
import chalk from "chalk";
import {AioCentralListener, CentralMeta} from "./aio-central-listener";
import {Event, HEADER} from "../aio/share";
import {AioType, AnchorMeta, AioAnchorServer, NeedAnchorOpts} from "../aio/anchor-server";
import {TokenService} from "../service/token.service";
import {TokenOption} from "../service/token.service/opts";


export class AioCentral {
    private readonly _anchorServer:AioAnchorServer<any>;
    private readonly _listener:AioCentralListener;
    private readonly _opts:ServerOptions;
    private readonly _tokenService:TokenService;


    constructor( opts:ServerOptions ) {
        let self = this;
        this._opts = opts;
        this._tokenService = new TokenService( opts as TokenOption );
        this._anchorServer = new AioAnchorServer<any>( {
            identifier: "@central",
            listen: [ this.opts.anchorPort ],
            sendHeader: true,
            maxSlots: opts.maxSlots,
            minSlots: opts.minSlots,
            anchorPoint: "CONNECTION",
            onNeedAnchor: ( type, server, opts) => this.needAnchor( type, server, opts ),
            emit( server: string, event: Event, ...data) {
                self.listener.waitChanelOf( server ).then( value => {
                    value.emit( event, ...data )
                })
            }
        });
        this._listener = new AioCentralListener( this );
    }

    get opts(): ServerOptions {
        return this._opts;
    } get anchorServer(): AioAnchorServer<any> {
        return this._anchorServer;
    } get listener(): AioCentralListener {
        return this._listener;
    } get tokenService(){
        return this._tokenService;
    }

    private needAnchor(type: AioType, server: string, opts: NeedAnchorOpts): Promise<AioSocket<AnchorMeta<any>>> {
        return new Promise<AioSocket<AnchorMeta<any>>>( (resolve ) => {
            let connection = this.listener.server.findSocketByMeta( meta => meta.server === server );
            if( !connection ) resolve( null );

            connection.send( Event.SLOTS, HEADER.slot({
                anchors:[],
                aioType: type,
                origin: server,
                needOpts:opts,
            }))
        });
    }

    closeServer( currentAgent: AioSocket<CentralMeta>) {
        if( !currentAgent ) return;
        this._anchorServer.filterSocketByMeta( meta => meta.referer === currentAgent.id ).forEach( value => {
            value.close();
        });
        this._listener.server.filterSocketByMeta( meta => meta.referer === currentAgent.id).forEach( value => {
            value.close();
        })
        currentAgent.close();
    }

    start() {
        this._anchorServer.start( () => {
            console.log( "[ANCHORAIO] Server>", `Running server anchor on port ${ chalk.greenBright( String( this.opts.anchorPort ) )}`)
        });
        this._listener.start( () => {
            console.log( "[ANCHORAIO] Server>", `Running server on port ${ chalk.greenBright( String( this.opts.serverPort ) )}`)
        });
    }
}
