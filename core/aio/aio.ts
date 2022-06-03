import net, { NetConnectOpts } from "net";
import {AioSocket, AioSocketOpts, convertToAioSocket, Meta} from "./socket";
import {AioServer, AioServerOpts} from "./server";

export module aio {
    export function connect<T>( opts:(NetConnectOpts&AioSocketOpts<T>)|number, host?:string){
        let _opts:AioSocketOpts<T>;
        if( opts && typeof opts === "object" ) {
            _opts = opts;
        }
        let socket:net.Socket;
        if( typeof opts === "number" && host ) socket = net.connect( opts, host );
        else socket = net.connect( opts as NetConnectOpts );

        if( !_opts ) _opts =  { listenEvent: true, isConnected: false };
        if( !Object.keys( _opts).includes( "listenEvent" )) _opts.listenEvent = true;
        return convertToAioSocket<T>( socket, _opts );
    }

    export function convert<M extends Meta>(  socket: net.Socket,     opts?: string | AioSocketOpts<M>): AioSocket<any> {
        return convertToAioSocket<M>( socket, opts );
    }

    export function createServer( opts:AioServerOpts){
        return new AioServer( opts )
    }
}




