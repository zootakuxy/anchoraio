import {ServerOptions} from "./opts";
import {AioSocket} from "../aio/socket";
import chalk from "chalk";
import {AioCentralListener, CentralMeta} from "./aio-central-listener";
import {Event, HEADER} from "../global/share";
import {AioType, AnchorMeta, AioAnchorServer, NeedAnchorOpts} from "../aio/anchor-server";


export class AioCentral {
    private readonly _anchorServer:AioAnchorServer<any>;
    private readonly _listener:AioCentralListener;
    private readonly _opts:ServerOptions;

    constructor( opts:ServerOptions ) {
        let self = this;
        this._opts = opts;
        this._anchorServer = new AioAnchorServer<any>( {
            identifier: "@central",
            port: this.opts.anchorPort,
            sendHeader: true,
            maxSlots: 6,
            minSlots: 2,
            anchorPoint: "CONNECTION",
            onNeedAnchor: ( type, server, opts) => this.needAnchor( type, server, opts ),
            chanelOf( server: string): AioSocket<any> {
                return self.listener.chanelOf( server );
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
