import net from "net";
import {nanoid} from "nanoid";
import {AioSocket, AioSocketOpts, convertToAioSocket, Meta} from "./socket";

export type OnAioConnectionListener<M extends Meta> = (aioSocket:AioSocket<M> ) => void;

export interface AioServerOpts {
    port:number,
    identifier?:string,
    namespace?:string,
    sendHeader?:boolean,
    listenEvent?:boolean,
    auth?( aioSocket: AioSocket<any>, args:any, accept:( ...args:any[])=>void, reject:( ...args:any[] )=>void )
}

export class AioServer<M extends Meta> {
    private readonly _opts:AioServerOpts;
    private readonly _server:net.Server;

    protected _serial:{[p:string]:number} = new Proxy({},{
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[p] = 0;
            return target[ p ]++;
        }
    });

    private _aioSockets:{ [p:string]:AioSocket<M> } = {}
    private _listener:{ on?:OnAioConnectionListener<M>[], once?:OnAioConnectionListener<M>[] } = new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[p] =[];
            return target[p]
        }
    });

    constructor( opts:AioServerOpts ) {
        this._opts = opts;
        this._server = net.createServer(( socket)=>{
            let _isAuth:boolean;
            let opts:AioSocketOpts<M> = { id: this.nextId(), isConnected: true, isAuth(){
                return _isAuth;
            }};

            opts.listenEvent = this.opts.listenEvent;
            let aioSocket = convertToAioSocket( socket, opts );

            let _accept = ( ...data:any[] )=>{
                _isAuth = true;
                if( this.opts.sendHeader ) aioSocket.send( "auth", aioSocket.id, ...data );
                this.onAccept( aioSocket, ...data )

            }, _reject = (...args:any[])=>{
                _isAuth = false;
                if( this.opts.sendHeader ) aioSocket.send( "auth", null, ...args );
                else aioSocket.close();
                this.onReject( aioSocket, ...args );
            }

            if( typeof this.opts.auth === "function" ) {
                aioSocket.onceListen( "chunk", chunk => {
                    let pack = chunk;
                    try{ pack = JSON.parse( pack ); } catch (e){ }
                    this.opts.auth( aioSocket, pack, _accept, _reject );
                });
            } else _accept();

            aioSocket.on( "close", hadError => {
                if( !!this._aioSockets[  aioSocket.id ] ) delete this._aioSockets[ aioSocket.id ];
                else this._aioSockets[ aioSocket.id ] = undefined;
            });

            this._aioSockets[ aioSocket.id ] = aioSocket;

            this.onAttach( aioSocket );
            this.notifyConnection( aioSocket );
        });
    }

    get opts(): AioServerOpts {
        return this._opts;
    }

    get aioSockets(): { [p: string]: AioSocket<M> } {
        return this._aioSockets;
    }

    protected onAttach( aioSocket:AioSocket<M> ){ }

    protected notifyConnection( aioConnection:AioSocket<M>){
        this._listener.once.splice(0, this._listener.on.length ).forEach( value => value( aioConnection ) )
        this._listener.on.forEach( onListener => onListener( aioConnection ) );
    }

    private nextId(){
        let id = `${this.opts.namespace }://${ this.opts.identifier }:${ this.opts.port }/${ nanoid( 16 )}?${ this._serial["id"] }`;
        if( !this._aioSockets[ id ] ) return id;
        else return this.nextId();
    }

    onConnection( onConnection:OnAioConnectionListener<M> ){ this._listener.on.push( onConnection )}
    onceConnection( onConnection:OnAioConnectionListener<M> ){ this._listener.once.push( onConnection)}

    of( id:string|AioSocket<M> ){
        let socket:AioSocket<M>;
        if( typeof id === "string" ) socket = this._aioSockets[ id ];
        else if( socket && typeof socket === "object" ) socket = id;
        return socket;
    }

    mergeMeta( id:string|AioSocket<M>, meta:M ):boolean{
        if( !meta ) return false;
        let socket:AioSocket<M> = this.of( id );
        if( !socket ) return false;
        if( !socket.meta ) socket.meta = ({} as M);
        Object.assign( socket.meta, meta );
        return true;
    }

    mergeFromMeta( id:string, meta:M ):boolean{
        if( !meta ) return false;
        let socket:AioSocket<M> = this._aioSockets[ id ];
        if( !socket ) return false;
        if( !socket.meta ) socket.meta = ({} as M);
        let _currentMeta = socket.meta;
        socket.meta = meta;
        Object.assign( meta, _currentMeta );
        return true;
    }

    setMeta( id:string, meta:M ):Boolean{
        let socket:AioSocket<M> = this._aioSockets[ id ];
        if( !socket ) return false;
        socket.meta = meta;
        return true;
    }

    socketOf( id:string ):AioSocket<M>{
        return this._aioSockets[ id ];
    }

    metaOf( id:string):M{
        let socket = this.socketOf( id );
        if( !socket ) return null;
        return socket.meta;
    }

    filterSocketByMeta( callback:( meta:M )=>boolean|void):AioSocket<M>[]{
        if( typeof callback !== "function" ) return null;
        return Object.keys( this._aioSockets ).filter( value => {
            if( !this._aioSockets[value].meta ) this._aioSockets[value].meta = {} as M;
            callback(  this._aioSockets[value].meta )
        }).map( value => this._aioSockets[ value ]);
    }


    findSocketByMeta( callback:( meta:M, socket:AioSocket<M> )=>boolean|void):AioSocket<M>{
        if( typeof callback !== "function" ) return null;
        let id = Object.keys( this._aioSockets ).find( id => {
            if( !this._aioSockets[id].meta ) this._aioSockets[id].meta = {} as M;
            return callback(  this._aioSockets[id].meta , this._aioSockets[id]  )
        } );
        if( !id ) return null;
        return this._aioSockets[ id ];
    }

    inject( socket:AioSocket<M> ):boolean {
        if( !socket.id ) return false;
        if( !!this._aioSockets[ socket.id ] ) return false;
        this._aioSockets[ socket.id ] = socket;
        socket.on( "close", hadError =>  this.eject( socket ) );
    } eject( ... sockets: (AioSocket<M>|string)[] ) {
        let _aio = sockets.map( this.of );
        _aio.forEach( value => {
            if( !value ) return;
            if( !this._aioSockets[ value.id ] ) return;
            delete this._aioSockets[ value.id ];
        });
    }

    get sockets(){
        return Object.values( this._aioSockets );
    } get ids(){
        return Object.keys( this._aioSockets )
    } get entries():({key:string, value:AioSocket<M>})[]{
        return Object.entries( this._aioSockets ).map( (value)=> ({key:value[0], value:value[1]}))
    }

    get server(): net.Server {
        return this._server;
    }

    start( callback?:()=>void){         this.server.listen( this.opts.port, callback ); }
    stop( callback?:( err?:Error)=>void){  this.server.close( callback ); }

    protected onAccept(aioSocket: AioSocket<any>, ...param2: any[]) {}

    protected onReject(aioSocket: AioSocket<any>, ...param2: any[]) {}
}