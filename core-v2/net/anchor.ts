import net from "net";
import {nanoid} from "nanoid";
import {Listener} from "kitres/src/core/util/listener";
export type ConnectionSide = "server"|"client";
export type ConnectionStatus = "connected" | "disconnected";
export type ConnectionMethod = "REQ"|"RESP"|"GET"|"SET"|"AUTH";

export interface AnchorSocket<T> extends net.Socket {
    id():string,
    status(): ConnectionStatus,
    anchored():boolean
    props():T,
}

export function identifierOf( identifier:string ){
    if(! identifier.endsWith( ".aio" ) ) return `${identifier}.aio`;
    return  identifier;
}



export interface ListenableAnchorSocket<
    PROPS,
    LISTEN extends {
        [K in keyof LISTEN]: CallableFunction;
    }
> extends AnchorSocket< PROPS >{
    /**
     * Registra um callback para um evento usando o método "on".
     * @param method
     * @param event - O evento para o qual registrar o callback.
     * @param callback - O callback a ser registrado.
     */
    listen<K extends keyof LISTEN>(method:"on"| "once", event: K, callback: LISTEN[K]): void;
    /**
     * Notifica os ouvintes registrados para um evento específico.
     * @param event - O evento para o qual notificar os ouvintes.
     * @param args - Argumentos a serem passados para os callbacks dos ouvintes.
     * @returns Uma matriz de objetos que representam os ouvintes notificados.
     */
    send<K extends keyof LISTEN>(event: K, ...args: LISTEN[K] extends (...args: infer P) => any ? P : never[]);

    eventListener():Listener<LISTEN>
}


export type AnchorPoint = "AGENT-CLIENT"|"AGENT-CLIENT-DIRECT"|"CENTRAL"|"AGENT-SERVER";

export type AsAnchorConnect<T extends object > = {
    side: ConnectionSide
    method: ConnectionMethod
    props?:T,
}

export function asAnchorConnect<P extends {} >( socket:net.Socket, opts:AsAnchorConnect<P> ){
    if( !opts?.side ) throw new Error( "Required side definition" );
    if( !opts?.method ) throw new Error( "Required method definition" );
    if( !opts.props ) opts.props = {} as any;
    let _socket:AnchorSocket<P> = socket as any;

    _socket[ "_id" ] = `${ opts.method }:${ nanoid( 16 ) }`;
    if( opts.side === "client" ){
        _socket.on( "connect", () => {
            _socket[ "_status" ] = "connected";
        });
    } else {
        _socket["_status"]= "connected"
    }

    _socket.on( "close", hadError => {
        _socket[ "_status"] = "disconnected";
    });

    _socket.on("error", err => {
        _socket.end();
    });


    _socket[ "_props" ] = opts?.props;
    if( !_socket[ "_props" ] ) _socket[ "_props" ] = {}

    _socket.status = ()=>{ return _socket[ "_status" ]; }
    _socket.id = ()=>{ return _socket[ "_id" ]; }
    _socket.props = () => {
        return _socket[ "_props" ];
    };

    _socket.anchored  = () =>  false;

    return _socket;
}


export type AsListenableAnchorConnectOptions< P extends object, E extends { [ K in keyof E]:CallableFunction} > = AsAnchorConnect< P > & {
    attache?:Listener<E>,
}

export function asListenableAnchorConnect<
    P extends object,
    L extends {
        [K in keyof L]: CallableFunction;
    }
>( socket:net.Socket, opts:AsListenableAnchorConnectOptions<P, L> ) :ListenableAnchorSocket<P, L> {
    let _socket = asAnchorConnect( socket, opts ) as ListenableAnchorSocket< P, L>;
    const scape = "\\|" as const;
    const delimiter = "||"  as const;
    const EVENT_NAME="aio.send.eventName"  as const;
    const EVENT_ARGS="aio.send.args"  as const;

    if( !opts.attache ) opts.attache = new Listener<L>();
    _socket.send = ( event, ...args)=>{
        let pack =  {
            [EVENT_NAME]: event,
            [EVENT_ARGS]: args
        };
        let _str = JSON.stringify( pack );
        socket.write( _str.replace( /\|/g, scape ) +delimiter )
    }

    _socket.listen = ( method, event, callback) => {
        opts.attache[method]( event, callback );
    };

    _socket.on("data", data => {
        let str:string = data.toString();
        str.split( delimiter ).filter( value => value && value.length )
            .forEach( value => {
                let original = value.replace( /\\\|/g, "|");
                console.log( `NOTIFY:ANCHOR-POINT ${opts.side} | ${opts.method}`, original )


                try {
                    let pack = JSON.parse( original );
                    if( !pack || typeof pack !== "object" ) return;

                    let keys = Object.keys( pack );
                    if( !keys.includes(EVENT_NAME) || ! keys.includes( EVENT_ARGS ) ) return;
                    if( typeof pack[EVENT_NAME ] !== "string" ) return;



                    if( !Array.isArray( pack[EVENT_ARGS] )) return;
                    console.log( `NOTIFY:ANCHOR-POINT ${opts.side} | ${opts.method}`, pack[ EVENT_NAME ], pack[ EVENT_ARGS ] )
                    opts.attache.notify( pack[EVENT_NAME] as any, ...pack[EVENT_ARGS] as any );
                } catch (e) {
                    console.log( "ERROR-PARSE", original )
                    console.log( e );
                }
            });
    });

    _socket.eventListener = ( )=>{
        return opts.attache;
    }

    return  _socket;
}


export type CreateAnchorConnect<P  extends object> = AsAnchorConnect<P> &  {
    host:string,
    port:number
}
export function createAnchorConnect<P extends {} >( opts:CreateAnchorConnect<P> ){
    let socket = net.connect( {
        host: opts.host,
        port: opts.port
    });
    return asAnchorConnect( socket, opts );
}

export function createListenableAnchorConnect<
    P extends object,
    L extends {
        [K in keyof L]: CallableFunction;
    }
>( opts:AsListenableAnchorConnectOptions<P, L> & CreateAnchorConnect<P> ){
    let socket = createAnchorConnect( opts );
    return asListenableAnchorConnect( socket, opts );
}

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



