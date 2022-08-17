import net from "net";
import {lib} from "../lib";

export class Meta { }

export type SocketOnReadChunk = (chunk:string )=> void;
export type SocketOnReadEvent = (  ...args )=> void;
export type SocketOnReadAnyEvent = ( event:string, ...args )=> void;
export type OnSocketAuth = ( identifier:string, ...data:any[] )=> void;

export interface ConnectionParams { port?:number, host?:string }
export type AutoReconnect = ConnectionParams|(()=>ConnectionParams|Promise<ConnectionParams>);

export interface AioExtension<M> {
    connected:boolean,
    id:string,
    isAuth():boolean
    send( str:string ),
    send( event:string, ...data ),
    meta:M,
    onListen( cb:SocketOnReadChunk )
    onListen( event:string, cb:SocketOnReadEvent ) :void,
    onListen( event:"*", cb:SocketOnReadAnyEvent ) :void,
    onListen( event:"auth", cb:OnSocketAuth ) :void,
    onListen( event:"chunk", cb:SocketOnReadChunk ) :void,

    onceListen( cb:SocketOnReadChunk )
    onceListen( event:string, cb:SocketOnReadEvent ) :void,
    onceListen( event:"*", cb:SocketOnReadAnyEvent ) :void,
    onceListen( event:"auth", cb:OnSocketAuth ) :void,
    onceListen( event:"chunk", cb:SocketOnReadChunk ) :void,

    notifyEvent(event:string, ...data ),
    notifyEvent(event:"auth", identifier ),
    notifyEvent(event:"chunk", chunk ),
    autoReconnect:AutoReconnect
    reconnectTimeout:number
    close(): void;
}

export interface AioSocket<M extends Meta> extends net.Socket, AioExtension<M>{

}

type AuthData = string|object|number|boolean;


export interface AioSocketOpts<M> {
    id?:string,
    isConnected:boolean
    listenEvent?:boolean,
    autoReconnect?:AutoReconnect
    reconnectTimeout?:number,
    auth?:AuthData|(()=>AuthData|Promise<AuthData>)
    meta?:M
    isAuth?():boolean
}



export function errorOf( socket:net.Socket ){
    if( !socket?.["_readableState"]?.["errored"] ) return null;
    let port  = socket["_readableState"]["errored"]["port"]
    let address = socket["_readableState"]["errored"]["address"]
    let host  = socket["_readableState"]["errored"]["host"]
    let error = socket["_readableState"]["errored"]["code"]
    let errorNo = socket["_readableState"]["errored"]["errno"];
    return { port, address, host, error: error, errorNo }
}

export function convertToAioSocket<M extends Meta>( socket:net.Socket, opts?:string|AioSocketOpts<M> ): AioSocket<any>{
    let _opts:AioSocketOpts<M>;
    if( typeof opts === "string" ) _opts = { id: opts, isConnected: false, auth: null }
    else if( opts && typeof opts === "object" ) _opts = opts;
    else _opts = { isConnected: false, auth:null };

    let aioSocket:AioSocket<M>  = socket as AioSocket<M>;

    let _aio = {
        hadError:null as Error,
        id: _opts.id,
        auth: false,
        meta: _opts.meta||{} as M,
        autoReconnect:_opts.autoReconnect,
        connected: _opts.isConnected,
        send: function (raw: string) {
            // console.log( "SEND-RAW", aioSocket.connected, raw  )
            let chunk = scapeRaw( raw ) + END_CHUNK;
            if( aioSocket.connected ) return socket.write( chunk );
            else _aio.pendents.push( chunk );
            // console.log("WRIT-IN-MODE", chalk.yellowBright( String( aioSocket.connected ), raw ))
            // socket.write(chunk);
        },
        pendents:[],
        on:   lib.proxyOfArray<OnSocketAuth|SocketOnReadEvent|SocketOnReadAnyEvent|SocketOnReadChunk>(),
        once: lib.proxyOfArray<OnSocketAuth|SocketOnReadEvent|SocketOnReadAnyEvent|SocketOnReadChunk>(),
    }

    let registerEvent = ( event:string, callback:(... any)=>void, collector:{ [event:string]:(( ...any)=>void)[]} )=>{
        if(  typeof  event === "function" ){
            callback = event;
            event = "chunk";
        }

        if( typeof callback !== "function" ) return;
        collector[ event ].push( callback );
    }

    let extension:AioExtension<M> = {
        get id(){ return _aio.id  },
        set id( id ){
            _aio.id = id
        },
        isAuth(){
            if( typeof _opts.isAuth === "function" ) return _opts.isAuth()
            else return _aio.auth
        },
        get connected():boolean{ return _aio.connected },
        get meta(){
            if( !_aio.meta ) _aio.meta = {} as M;
            return _aio.meta;
        },
        reconnectTimeout: _opts.reconnectTimeout || 1000,
        send( event, ...data ){
            let raw = event;
            if( data.length > 0 ){
                raw = JSON.stringify({
                    "aio-event-name": event,
                    "aio-event-args": data,
                })
            }
            _aio.send( raw );
        }, onListen(event, cb? ){
            registerEvent( event, cb, _aio.on );

        }, onceListen( event, cb? ){
            registerEvent( event, cb, _aio.once );

        }, notifyEvent( event:string, ...data ){
            [ event, "*" ].forEach( _event => {
                _aio.once[ _event ].splice( 0, _aio.once[ _event ].length )
                    .forEach( value => {
                        if( typeof value !== "function" ) return;
                        if( _event === "*" ) return value( event, ...data );
                        // @ts-ignore
                        value( ...data );
                    });
                _aio.on[ _event ].forEach( value => {
                    if( typeof value !== "function" ) return;
                    if( _event === "*" ) return value( event, ...data );
                    // @ts-ignore
                    value( ...data );
                })
            });

        }, get autoReconnect(){
            return _aio.autoReconnect;
        }, set autoReconnect( reconnect ){
            _aio.autoReconnect = reconnect;
            if( !aioSocket.connected && _aio.autoReconnect && _aio.hadError ){
                tryReconnect()
            }
        }, close(){
            if( !aioSocket.connected ) return false;
            aioSocket.end( () => {});
        }
    }

    Object.defineProperties( aioSocket, Object.getOwnPropertyDescriptors(extension));


    function tryReconnect(){
        if( !aioSocket.autoReconnect ) return;
        if( aioSocket.connected ) return;

        if( typeof aioSocket.autoReconnect === "function" ){
            let result = aioSocket.autoReconnect();
            if( result instanceof Promise ) result.then( reconnectNow )
            else reconnectNow( result );
            return;
        } else reconnectNow( aioSocket.autoReconnect );
    }


    aioSocket.on( "error", err => {
        _aio.connected = false;
        _aio.hadError = err;
        tryReconnect();
    });

    function reconnectNow( opt:ConnectionParams|boolean ){
        let _reconnectOpts:ConnectionParams;
        if( opt && typeof opt === "object" ) _reconnectOpts = opt;
        else _reconnectOpts = {};

        let timeout = aioSocket.reconnectTimeout;
        if( !timeout || Number.isNaN( timeout ) || !Number.isFinite( timeout) ) timeout = 1000;
        if( !opt ) opt = {};
        let error = errorOf( aioSocket );
        _reconnectOpts.port = _reconnectOpts.port || error?.port;
        _reconnectOpts.host = _reconnectOpts.host || error?.host || error?.address;
        if( !_reconnectOpts.port || !_reconnectOpts.host ) return;



        setTimeout( ()=>{
            aioSocket.connect({ host: _reconnectOpts.host, port: _reconnectOpts.port });
        }, timeout);
    }

    aioSocket.onListen( "auth", ( identifier, ...data ) => {
        if( !identifier ) return aioSocket.close();
        _aio.id = identifier;
        _aio.auth = true;
        while ( aioSocket.connected && _aio.pendents.length ){
            aioSocket.write( _aio.pendents.shift() );
        }
    });

    socket.on( "connect", () => {
        _aio.connected = true;
        let _authNow = ( data:AuthData )=>{
            aioSocket.send( JSON.stringify( data ) );
        }

        let _authData = _opts.auth;

        if( typeof _authData === "undefined" || (typeof _authData === "object" && !_authData ) ) return;
        if( typeof _authData !== "function" ) return _authNow( _authData );
        _authData = _authData();
        if( _authData instanceof Promise ) return _authData.then( value => _authNow( value ));
        return _authNow( _authData );
    });

    let listenData = listenEventOnData( aioSocket );
    aioSocket.on( "data", listenData );
    aioSocket.on( "close", hadError => {
        _aio.connected = false;
    });
    return aioSocket;
}

export function listenEventOnData<M>( aioSocket:AioSocket<M>){
    return data => {
        let _data = data.toString();
        if( !_data.length ) return;
        let chunks = _data.split( END_CHUNK );
        chunks.pop();
        chunks.forEach( ( chunk)=>{
            chunk = unescapeChunk( chunk );
            let _object;
            try {
                _object = JSON.parse( chunk );
            } catch (e){ _object = null}

            aioSocket.notifyEvent( "chunk", chunk );

            if( !_object ) return;
            if( !_object["aio-event-name"] || !_object["aio-event-args"] ) return;
            let [event, args] = [_object["aio-event-name"], _object["aio-event-args"]];
            if( !Array.isArray( args ) ) return;
            aioSocket.notifyEvent( event, ...args)
        })
    };
}

//:END\n
//:END\\\n
export const END_CHUNK = ":END\n";
export const SCAPE_FORM = "\n";
export const SCAPE_TO = "\\\n";

export function scapeRaw(str:string ):string{
    if( !str ) return null;
    return str.replace( /(\n)/g, SCAPE_TO );
}

export function unescapeChunk(str:string ):string{
    if( !str ) return null;
    return str.replace( /(\\\n)/g, SCAPE_FORM )
}