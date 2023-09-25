import net from "net";
import {nanoid} from "nanoid";
import {Listener} from "kitres/src/core/util/listener";
export type ConnectionSide = "server"|"client";
export type ConnectionStatus = "connected" | "disconnected";
export type ConnectionMethod = "REQ"|"RESP"|"GET"|"SET"|"AUTH";

export interface AnchorSocket<P> extends net.Socket {
    id():string,
    endpoint():Endpoint
    status(): ConnectionStatus,
    anchored():boolean
    props( props?:P):P,
}

export function identifierOf( identifier:string ){
    if(! identifier.endsWith( ".aio" ) ) return `${identifier}.aio`;
    return  identifier;
}



export interface ListenableAnchorSocket<
    PROPS,
    L extends {
        [K in keyof L]: CallableFunction;
    }
> extends AnchorSocket< PROPS >{
    /**
     * Registra um callback para um evento usando o método "on".
     * @param method
     * @param event - O evento para o qual registrar o callback.
     * @param callback - O callback a ser registrado.
     */
    listen<K extends keyof L>(method:"on"| "once", event: K, callback: L[K]): void;
    /**
     * Notifica os ouvintes registrados para um evento específico.
     * @param event - O evento para o qual notificar os ouvintes.
     * @param args - Argumentos a serem passados para os callbacks dos ouvintes.
     * @returns Uma matriz de objetos que representam os ouvintes notificados.
     */
    send<K extends keyof L>(event: K, ...args: L[K] extends (...args: infer P) => any ? P : never[]);
    output( str:string );

    eventListener():Listener<ListenableAnchorListener<L>>

    onRaw( callback:( message:string ) => void )
    onceRaw( callback:( message:string ) => void )
    offRaw( callback:( message:string ) => void )
    onceOffRaw(callback:(message:string ) => void )
    startListener()
    stopListener()
}


export type AnchorPoint = "AGENT-CLIENT"|"AGENT-CLIENT-DIRECT"|"CENTRAL"|"AGENT-SERVER";

type Endpoint = "client"|"server"|"auth-client"|"auth-server"|boolean

export type AsAnchorConnect<T extends object > = {
    side: ConnectionSide
    endpoint:Endpoint,
    method: ConnectionMethod
    props?:T,
}

const ANCHOR_SYMBOL = Symbol.for("asAnchorConnect");

export function asAnchorConnect<P extends {} >( socket:net.Socket, opts:AsAnchorConnect<P> ):AnchorSocket<P>{
    if( socket[ ANCHOR_SYMBOL ]) return  socket as AnchorSocket<P>;
    if( !opts?.side ) throw new Error( "Required side definition" );
    if( !opts?.method ) throw new Error( "Required method definition" );
    if( !opts.props ) opts.props = {} as any;
    let _socket:AnchorSocket<P> = socket as any;

    _socket.on("data", data => {
        console.log( "READING DATA LENGTH", data.length );
    });

    _socket[ "_id" ] = `${ opts.method }:${ nanoid( 16 ) }`;

    if( opts.side === "client" ){
        _socket.on( "connect", () => {
            _socket[ "_status" ] = "connected";
        });
    } else {
        _socket["_status"]= "connected"
    }

    _socket.on( "close", () => {
        _socket[ "_status"] = "disconnected";
    });

    _socket.on("error", () => {
        _socket.end();
    });


    _socket[ "_props" ] = opts?.props;
    if( !_socket[ "_props" ] ) _socket[ "_props" ] = {}

    _socket.status = ()=>{ return _socket[ "_status" ]; }
    _socket.id = ()=>{ return _socket[ "_id" ]; }
    _socket.props = ( props:P ) => {
        if( !! props ) _socket[ "_props" ] = props;
        return _socket[ "_props" ];
    };

    _socket.endpoint =()=>{
        return opts.endpoint;
    }

    _socket.anchored  = () =>  false;

    socket[ ANCHOR_SYMBOL ] = true;
    return _socket;
}


export type AsListenableAnchorConnectOptions< P extends object, E extends { [ K in keyof E]:CallableFunction} > = AsAnchorConnect< P > & {
    attache?:Listener< ListenableAnchorListener<E>>,
}


const LISTENABLE_ANCHOR_SYMBOL = Symbol.for("asListenableAnchorConnect");
export type  ListenableAnchorListener <L extends {
    [K in keyof L]: CallableFunction;
}> = L & {
}
export function asListenableAnchorConnect<
    P extends object,
    L extends {
        [K in keyof L]: CallableFunction;
    }
>( socket:net.Socket, opts:AsListenableAnchorConnectOptions<P, L> ) :ListenableAnchorSocket<P, L> {
    if( socket[LISTENABLE_ANCHOR_SYMBOL]) return socket as any;
    let _socket = asAnchorConnect( socket, opts ) as ListenableAnchorSocket< P, L>;
    const scape = "\\|" as const;
    const END = "||"  as const;
    const EVENT_NAME="aio.send.eventName"  as const;
    const EVENT_ARGS="aio.send.args"  as const;

    if( !opts.attache ) opts.attache = new Listener<ListenableAnchorListener<L>>();
    let _output = ( str:string )=>{
        socket.write( str.replace( /\|/g, scape ) +END )
    }

    _socket.send = ( event, ...args)=>{
        let pack =  {
            [EVENT_NAME]: event,
            [EVENT_ARGS]: args
        };
        let _str = JSON.stringify( pack );
        return _output( _str );
    }

    _socket.output = _output;

    _socket.listen = ( method, event, callback) => {
        opts.attache[method]( event, callback as any );
    };


    let rawListener:Listener<{
        raw( data:string )
    }> = new Listener();

    _socket.onRaw= callback => rawListener.on( "raw", callback );
    _socket.onceRaw = callback => rawListener.once( "raw", callback );
    _socket.offRaw = callback => rawListener.off( "raw", callback );
    _socket.onceOffRaw = callback => rawListener.onceOff( "raw", callback );

    let preview = "";

    let dataListener = ( data:Buffer )=>{
        let str:string = preview+data.toString();
        if( !str.includes( END ) ) return;
        let parts = str.split( END );
        if( !str.endsWith( END ) ){
            preview = parts.pop();
        }

        parts.filter( value => value && value.length )
            .forEach( value => {
                let raw:string = value.replace( /\\\|/g, "|");
                rawListener.notifySafe( "raw", raw );

                let notify = ( pack ) =>{
                    let args = pack[ EVENT_ARGS ];
                    let event = pack[ EVENT_NAME ];
                    // @ts-ignore
                    opts.attache.notify( event as any, ...args as any );
                    notify = ()=> { }
                }

                if( raw.charAt(0) !== "{" ) return;
                if( raw.charAt( raw.length-1 ) !== "}" ) return;

                try {
                    let pack = JSON.parse( raw );
                    if( !pack || typeof pack !== "object" ) return;

                    let keys = Object.keys( pack );
                    if( !keys.includes(EVENT_NAME) || ! keys.includes( EVENT_ARGS ) ) return;
                    if( typeof pack[EVENT_NAME ] !== "string" ) return;

                    if( !Array.isArray( pack[EVENT_ARGS] )) return;
                    return notify( pack );
                } catch (e) {
                    console.log( "ERROR-PARSE", raw )
                    console.log( e );
                    return;
                }
            });
    }

    _socket.startListener = () =>{
        socket.off( "data", dataListener );
        socket.on( "data", dataListener );
    }

    _socket.stopListener = ()=>{
        _socket.off( "data", dataListener )
    }

    _socket.eventListener = ( )=>{
        return opts.attache;
    }
    _socket.startListener();
    socket[LISTENABLE_ANCHOR_SYMBOL] = true;
    return  _socket;
}


export type CreateAnchorConnect<P  extends object> = AsAnchorConnect<P> &  {
    host:string,
    port:number
}
export function createAnchorConnect<P extends {} >( opts:CreateAnchorConnect<P> ){
    let socket = net.connect( {
        host: opts.host,
        port: opts.port,
        // writableHighWaterMark: 1024 * 1024,
        // readableHighWaterMark : 1024 * 1024
    }, () => {

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


    let endpoints:Endpoint[] = [ "server", "client" ];
    let redirect = ( from:AnchorSocket<T>, to:AnchorSocket<T>, data:Buffer )=>{
        let buffer = data;
        if( !endpoints.includes( to.endpoint() )){
            const messageLength = data.length;
            const buffer = Buffer.alloc(4 + messageLength); // 4 bytes para armazenar o tamanho
            buffer.writeUInt32BE(messageLength, 0);
            data.copy( buffer, 4);
        }

        console.log( `REDIRECT FROM ${ from.endpoint()} to ${ to.endpoint() }` );
        console.log( buffer.toString() );
        to.write( buffer );
    }


    let __anchor = (_left:AnchorSocket<T>, _right:AnchorSocket<T> ) => {

        let receivedData = Buffer.alloc(0);
        let expectedLength = 0;


        _left.on( "data", data => {

            let onComplete = ( _adata )=>{
                redirect( _left, _right, _adata );
                // Limpe o buffer e o tamanho esperado para a próxima mensagem
                receivedData = receivedData.slice( expectedLength );
                expectedLength = 0;
            }

            receivedData = Buffer.concat([receivedData, data]);
            // Se o tamanho esperado ainda não foi determinado
            if (expectedLength === 0 && receivedData.length >= 4) {
                expectedLength = data.readUInt32BE(0);
                receivedData = receivedData.slice(4);
            }


            if( endpoints.includes( _left.endpoint() ) ){
                return onComplete( receivedData );
            }

            // Verifique se recebemos a mensagem completa
            if (receivedData.length >= expectedLength ) {
                return onComplete( receivedData );
            }

            console.log( `REDIRECT FROM ${ _left.endpoint()} to ${ _left.endpoint() } WAIT MORE | receivedData.length = ${receivedData.length}; expectedLength = ${ expectedLength } at ${ point }` );
        });
        // _left.pipe( _right );
        _left.on( "close", () => {
            _right.end();
        });

        _left.anchored  = () =>  true;
    }

    let __switchData = ( from:AnchorSocket<T>, to:AnchorSocket<T>, data )=>{
        while ( data.length ){
            let next  = requestData.shift();
            redirect( from, to, next );
        }
    }

    __anchor( requestSide, responseSide );
    __anchor( responseSide, requestSide );

    __switchData( requestSide, responseSide, requestData );
    __switchData( responseSide, requestSide, responseData );

    console.log( `REQUEST ${ requestSide.id()} TO ${ aioHost }  ANCHOR AT ${point} ${ hasRequestData }`)
}



