import {BaseEventEmitter} from "kitres";
import net from "net";

export interface ServerEvent {
    connection( socket:net.Socket ),
    listening(),
    close(),
    error( error:Error )
    drop( data?:net.DropArgument )
}

const SERVER_EVENTS_NAME:(keyof ServerEvent)[] = [ "connection", "listening", "close", "error", "drop" ];

export interface ServerOptions extends net.ServerOpts {
    safe?:boolean
}

type ServerListener = {
    server:net.Server,
    port:number
}

export class AIOServer extends BaseEventEmitter<ServerEvent>{
    private readonly _servers:ServerListener[];
    opts:ServerOptions

    constructor( opts?:ServerOptions) {
        super();
        if( !opts ) opts = {};
        this.opts = opts;
        this._servers= [];
    }

    listen( listener?:(  port:number )=> void, ...ports:number[]){
        (new Set( ports )).forEach( port => {
            let _server = net.createServer({
                // pauseOnConnect: this.opts.pauseOnConnect,
                // keepAlive: this.opts.keepAlive,
                // noDelay: this.opts.noDelay,
                // keepAliveInitialDelay: this.opts.keepAliveInitialDelay,
                // allowHalfOpen: this.opts.allowHalfOpen
            });
            SERVER_EVENTS_NAME.forEach( eventName => {
                _server.on( eventName, (...args) => {
                    // @ts-ignore
                    if( this.opts.safe ) this.notifySafe( eventName, ...args );

                    // @ts-ignore
                    else this.notifySafe( eventName, ...args );
                });
            });
            this._servers.push({
                server: _server,
                port: port
            });

            _server.listen( port, () => {
                if( typeof listener === "function" ) listener( port );
            });
        });

    };


    server( port?:number ){
        if( !port &&this._servers.length === 1 ) return this._servers[0].server;
        return this._servers.find( value => value.port === port )?.server
    };

    servers(){
        return [ ...this._servers ];
    }

    close( callback:( error?:Error )=>void,...ports){
        if( !ports || !ports.length ) ports = this._servers.map( value => value.port );
        (new Set(ports)).forEach( port => {
            let index = this._servers.findIndex( value => value.port === port );
            if( index === -1 ) return;
            let server = this._servers[ index ];
            server.server.close( callback );
            this._servers.splice( index, 1 );
        })


    }
}