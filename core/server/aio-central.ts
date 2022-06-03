import {ServerOptions} from "./opts";
import {AioSocket} from "../aio/socket";
import {AioCentralListener, CentralMeta} from "./aio-central-listener";
import {Event, eventCode, headerMap} from "../global/share";
import {nanoid} from "nanoid";
import {AioType, AnchorMeta, AioAnchorServer, NeedAnchorOpts} from "../aio/anchor-server";
import {AioServer} from "../aio/server";

interface CentralExtras {
}

export class AioCentral {
    private readonly _anchorServer:AioAnchorServer<CentralExtras>;
    private readonly _listener:AioCentralListener;
    private readonly _opts:ServerOptions;

    constructor( opts:ServerOptions ) {
        let self = this;
        this._opts = opts;
        this._anchorServer = new AioAnchorServer<CentralExtras>( {
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
    } get anchorServer(): AioAnchorServer<CentralExtras> {
        return this._anchorServer;
    } get listener(): AioCentralListener {
        return this._listener;
    }

    private needAnchor(type: AioType, server: string, opts: NeedAnchorOpts): Promise<AioSocket<AnchorMeta<CentralExtras>>> {
        return new Promise<AioSocket<AnchorMeta<CentralExtras>>>( (resolve, reject) => {
            let connection = this.listener.server.findSocketByMeta( meta => meta.server === server );
            if( !connection ) resolve( null );

            connection.send( Event.SLOTS, headerMap.SLOTS({
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
        this._anchorServer.start();
        this._listener.start();
    }
}
