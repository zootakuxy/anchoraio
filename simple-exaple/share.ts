import net from "net";
import {agentPort, serverAnchorPort, serverHost, serverPort} from "./maps";

export enum ConnectionType {
    ANCHOR="ConnectionType.ANCHOR",
    // ANCHOR_READY="ConnectionType.ANCHOR_READY",
    SERVER="ConnectionType.SERVER",
    CONNECTION="ConnectionType.CONNECTION",
}

export type Connection = {
    id: string,
    socket:SocketConnection
}

export const DEFAULT_SHARE = {
    SERVER_HOST: serverHost,
    SERVER_PORT: serverPort,
    SERVER_ANCHOR_PORT: serverAnchorPort,
    AGENT_PORT: agentPort,
}

export const showHeader = (any) =>{
    console.log( `${"".padEnd( 36, "=")} HEADER ${"".padEnd( 36, "=")}` );
    Object.keys( any ).forEach( key => {
        console.log( `${key} `.padEnd( 40, "-" )+"  ", any[ key ])
    });
    console.log( "".padEnd( 80, "=") );
}


export function writeInSocket( socket:net.Socket, data, cb?:( data?:any, socket?:net.Socket )=>void ){
    let _data = data;
    if( typeof data !== "string" ) _data = JSON.stringify( _data );
    console.log( _data );
    socket.write( Buffer.from( _data+"\n" ), "utf-8", _data );
}

export type SocketConnection = net.Socket & { id:string }
