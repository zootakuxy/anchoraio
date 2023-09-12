import net from "net";
import {nanoid} from "nanoid";

export type ConnectionSide = "server"|"client";
export type ConnectionStatus = "connected" | "disconnected";
export type ConnectionMethod = "REQ"|"RESP"|"GET"|"SET"|"AUTH";


export interface AnchorSocket<T > extends net.Socket {
    id():string,
    status(): ConnectionStatus,
    anchored():boolean
    props():T
}


export function identifierOf( identifier:string ){
    if(! identifier.endsWith( ".aio" ) ) return `${identifier}.aio`;
    return  identifier;
}


export interface AsSocketAIOOptions <T>{
    side: ConnectionSide
    method: ConnectionMethod
    props?:T
}

export function asAnchorSocket<T extends {} >(net:net.Socket, opts:AsSocketAIOOptions<T> ){
    let socket:AnchorSocket<T> = net as AnchorSocket<T>;
    socket[ "_id" ] = `${ opts.method }:${ nanoid( 16 ) }`;
    if( opts.side === "client" ){
        socket.on( "connect", () => {
            socket[ "_status" ] = "connected";
        });
    } else {
        socket["_status"]= "connected"
    }

    socket.on( "close", hadError => {
        socket[ "_status"] = "disconnected";
    });

    socket[ "_props" ] = opts?.props;
    if( !socket[ "_props" ] ) socket[ "_props" ] = {}

    socket.status = ()=>{ return socket[ "_status" ]; }
    socket.id = ()=>{ return socket[ "_id" ]; }
    socket.props = () => {
      return socket[ "_props" ];
    };
    socket.anchored  = () =>  false;
    return socket;
}
export type AnchorPoint = "AGENT-CLIENT"|"AGENT-CLIENT-DIRECT"|"CENTRAL"|"AGENT-SERVER";

export function anchor<T extends { }>(aioHost:string, point:AnchorPoint, requestSide:AnchorSocket<T>, responseSide:AnchorSocket<T>, requestData:any[], responseData){
    if( !requestData ) requestData = [];
    if( !responseData ) responseData = [];

    let hasRequestData = requestData.length? "WITH DATA": "NO DATA";

    let __anchor = (_left:AnchorSocket<T>, _right:AnchorSocket<T> ) => {
        _left.pipe( _right );
        _left.on( "close", () => {
            _right.end();
        });
        _left.anchored  = () =>  true;
    }

    let __switchData = (side:AnchorSocket<T>, data:any[])=>{
        while ( data.length ){
            side.write( requestData.shift() );
        }
    }

    __anchor( requestSide, responseSide );
    __anchor( responseSide, requestSide );
    __switchData( responseSide, requestData );
    __switchData( requestSide, responseData );

    console.log( `REQUEST ${ requestSide.id()} TO ${ aioHost }  ANCHOR AT ${point} ${ hasRequestData }`)
}