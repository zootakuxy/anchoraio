import net, { NetConnectOpts } from "net";
import {AioSocket, AioSocketOpts, convertToAioSocket, Meta} from "./socket";
import {AioServer, AioServerOpts} from "./server";
import path from "path";

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

    export const Defaults = {
        //language=file-reference
        envFile: path.join(__dirname, "../../etc/anchorio.conf" ),
        etc: path.join(__dirname, "../../etc/entry" ),
        agentPort:  36900,
        agentAPI :  36901,
        serverPort: 36902,
        anchorPort: 36903,
        dnsPort:    53,
        chanel:     10,
        serverHost: "127.0.0.1",
        reconnectTimeout: 1000,
        maxSlots: 6,
        minSlots: 3,
        dns: [ "8.8.8", "8.8.4.4" ]
    }

    export interface BaseOpts {
        etc:string,
        envFile:string,
    }

    export type GlobalOpts = BaseOpts &{
        maxSlots:number
        minSlots:number
    }

}




