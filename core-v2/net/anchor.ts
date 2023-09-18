import net from "net";
import {nanoid} from "nanoid";
import {Listener} from "kitres/src/core/util/listener";
export type ConnectionSide = "server"|"client";
export type ConnectionStatus = "connected" | "disconnected";
export type ConnectionMethod = "REQ"|"RESP"|"GET"|"SET"|"AUTH";


interface SocketListen<T extends {
    [K in keyof T]: CallableFunction;
}> {
    /**
     * Registra um callback para um evento usando o método "on".
     * @param event - O evento para o qual registrar o callback.
     * @param callback - O callback a ser registrado.
     */
    listen<K extends keyof T>( method:"on"| "once", event: K, callback: T[K]): void;
    /**
     * Notifica os ouvintes registrados para um evento específico.
     * @param event - O evento para o qual notificar os ouvintes.
     * @param args - Argumentos a serem passados para os callbacks dos ouvintes.
     * @returns Uma matriz de objetos que representam os ouvintes notificados.
     */
    send<K extends keyof T>(event: K, ...args: T[K] extends (...args: infer P) => any ? P : never[]);

    eventListener():Listener<T>
}


export interface AnchorSocket<T, E extends { [ K in keyof E]:CallableFunction} > extends SocketListen<E>, net.Socket {
    id():string,
    status(): ConnectionStatus,
    anchored():boolean
    props():T,
}


export function identifierOf( identifier:string ){
    if(! identifier.endsWith( ".aio" ) ) return `${identifier}.aio`;
    return  identifier;
}

export interface AsSocketAIOOptions <T, E extends { [ K in keyof E]:CallableFunction}>{
    side: ConnectionSide
    method: ConnectionMethod
    props?:T,
    attache?:Listener<E>,
    noListen?:boolean
}

export type AnchorPoint = "AGENT-CLIENT"|"AGENT-CLIENT-DIRECT"|"CENTRAL"|"AGENT-SERVER";

export function asAnchorSocket<T extends {}, E extends { [ K in keyof E]:CallableFunction} >(net:net.Socket, opts:AsSocketAIOOptions<T, E> ){
    if( !opts?.side ) throw new Error( "Required side definition" );
    if( !opts?.method ) throw new Error( "Required method definition" );

    if( !opts.attache ) opts.attache = new Listener<E>();
    if( !opts.props ) opts.props = {} as any;
    let socket:AnchorSocket<T, E> = net as any
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

    socket.on("error", err => {
       socket.end();
    });


    socket[ "_props" ] = opts?.props;
    if( !socket[ "_props" ] ) socket[ "_props" ] = {}

    socket.status = ()=>{ return socket[ "_status" ]; }
    socket.id = ()=>{ return socket[ "_id" ]; }
    socket.props = () => {
      return socket[ "_props" ];
    };

    socket.anchored  = () =>  false;

    const scape = "\\|" as const;
    const delimiter = "||"  as const;
    const EVENT_NAME="aio.send.eventName"  as const;
    const EVENT_ARGS="aio.send.args"  as const;



    socket.send = ( event, ...args)=>{
        if( opts.noListen ) return;
        let pack =  {
            [EVENT_NAME]: event,
            [EVENT_ARGS]: args
        };
        let _str = JSON.stringify( pack );
        socket.write( _str.replace( /\|/g, scape ) +delimiter )
    }

    socket.listen = ( method, event, callback) => {
        if( opts.noListen ) return;
        opts.attache[method]( event, callback );
    };

    socket.on("data", data => {
        if( opts.noListen ) return;
        let str:string = data.toString();
        str.split( delimiter ).filter( value => value && value.length )
            .forEach( value => {
                let original = value.replace( /\\\|/g, "|");
                try {
                    let pack = JSON.parse( original );
                    if( !pack || typeof pack !== "object" ) return;

                    let keys = Object.keys( pack );
                    if( !keys.includes(EVENT_NAME) || ! keys.includes( EVENT_ARGS ) ) return;
                    if( typeof pack[EVENT_NAME ] !== "string" ) return;

                    console.log( { original } );


                    if( !Array.isArray( pack[EVENT_ARGS] )) return;
                    opts.attache.notifySafe( pack[EVENT_NAME] as any, ...pack[EVENT_ARGS] as any );
                } catch (e) {
                    console.log( e );
                }
            });
    });


    socket.eventListener = ( )=>{
        if( opts.noListen ) return null;
        return opts.attache;
    }
    return socket;
}

function listen(){

}

export function anchor<T extends { }, E extends { [ K in keyof E]:CallableFunction}>(aioHost:string, point:AnchorPoint, requestSide:AnchorSocket<T, E>, responseSide:AnchorSocket<T, E>, requestData:any[], responseData){
    if( !requestData ) requestData = [];
    if( !responseData ) responseData = [];

    let hasRequestData = requestData.length? "WITH DATA": "NO DATA";

    let __anchor = (_left:AnchorSocket<T, E>, _right:AnchorSocket<T, E> ) => {
        _left.pipe( _right );
        _left.on( "close", () => {
            _right.end();
        });
        _left.anchored  = () =>  true;
    }

    let __switchData = (side:AnchorSocket<T, E>, data:any[])=>{
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



