import net from "net";
import {AioSocket, AioSocketOpts, convertToAioSocket, Meta} from "./socket";
import fs from "fs";
import chalk from "chalk";
import os from "os";
import Path from "path";

export type OnAioConnectionListener<M extends Meta> = (aioSocket:AioSocket<M> ) => void;

function nanoid( len:number ){
    return String( Math.random()*99999999999 );
}

type ServerListen = string|number;
export interface AioServerOpts{
    listen:ServerListen|ServerListen[],
    identifier?:string,
    namespace?:string,
    sendHeader?:boolean,
    listenEvent?:boolean,
    auth?( aioSocket: AioSocket<any>, args:any, accept:( ...args:any[])=>true, reject:( ...args:any[] )=>false )
}

export class AioServer<M extends Meta> {
    private readonly _opts:AioServerOpts;
    private readonly _net:net.Server;

    protected _serial:{[p:string]:number} = new Proxy({},{
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[p] = 0;
            return target[ p ]++;
        }
    });

    public static pathFrom( ...ctrl :string[]):string{
        let _ctrl = Path.join( ...ctrl )
        if( os.platform() === "win32" ) return Path.join( "\\\\?\\pipe", _ctrl );
        else return _ctrl;
    }

    private _aioSockets:{ [p:string]:AioSocket<M> } = {}
    private _connectionListener:{ on?:OnAioConnectionListener<M>[], once?:OnAioConnectionListener<M>[] } = new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[p] =[];
            return target[p]
        }
    });


    constructor( opts:AioServerOpts ) {
        this._opts = opts;
        this._net = net.createServer((socket)=>{
            let _isAuth:boolean;
            let opts:AioSocketOpts<M> = { id: this.nextId(), isConnected: true, isAuth(){
                    return _isAuth;
                }};


            opts.listenEvent = this.opts.listenEvent;
            let aioSocket = convertToAioSocket( socket, opts );

            let _accept = ( ...data:any[] ):true=>{
                _isAuth = true;
                if( this.opts.sendHeader ) aioSocket.send( "auth", aioSocket.id, ...data );
                this.onAccept( aioSocket, ...data );
                return true;

            }, _reject = (...args:any[]):false=>{
                _isAuth = false;
                if( this.opts.sendHeader ) aioSocket.send( "auth", null, ...args );
                else aioSocket.close();
                this.onReject( aioSocket, ...args );
                return false;
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
                else delete this._aioSockets[ aioSocket.id ];
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
        this._connectionListener.once.splice(0, this._connectionListener.on.length ).forEach( value => value( aioConnection ) )
        this._connectionListener.on.forEach( onListener => onListener( aioConnection ) );
    }

    private nextId(){
        let id = `${this.opts.namespace }://${ this.opts.identifier }/${ nanoid( 16 )}?${ this._serial["id"] }`;
        if( !this._aioSockets[ id ] ) return id;
        else return this.nextId();
    }

    onConnection( onConnection:OnAioConnectionListener<M> ){ this._connectionListener.on.push( onConnection )}
    onceConnection( onConnection:OnAioConnectionListener<M> ){ this._connectionListener.once.push( onConnection)}

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

    broadcast( str:string );
    broadcast( event:string, ...data:any[]);
    broadcast( event:string, ...data:any[]) {
        // this.sockets.forEach( value => {
        //     if( value.connected ) value.send(event, ...data );
        // })
    }

    metaOf( id:string):M{
        let socket = this.socketOf( id );
        if( !socket ) return null;
        return socket.meta;
    }

    filterSocketByMeta( callback:( meta:M, socket:AioSocket<M> )=>boolean|void):AioSocket<M>[]{
        if( typeof callback !== "function" ) return null;
        return Object.keys( this._aioSockets ).filter( value => {
            if( !this._aioSockets[value].meta ) this._aioSockets[value].meta = {} as M;
            return callback(  this._aioSockets[value].meta, this._aioSockets[ value ] )
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
        sockets.map( socket => this.of( socket ) ).forEach( value => {
            if( !value ) return;
            if( !this._aioSockets[ value.id ] ) return;
            delete this._aioSockets[ value.id ];
        });
    }

    get sockets():AioSocket<M>[]{
        return Object.values( this._aioSockets );
    } get ids(){
        return Object.keys( this._aioSockets )
    } get entries():({key:string, value:AioSocket<M>})[]{
        return Object.entries( this._aioSockets ).map( (value)=> ({key:value[0], value:value[1]}))
    }

    get net(): net.Server {
        return this._net;
    }

    start( callback?:( listen:ServerListen, error?:Error )=>void){
        let self = this;
        let _listen:ServerListen[] = [];
        if( Array.isArray( this.opts.listen ) ) _listen.push( ...this.opts.listen );
        else _listen.push( this.opts.listen );

        _listen.forEach( value => {
            this.net.listen( value, () => {
                if( typeof callback === "function" ) callback( value );
            });
        });

        this.net.on( "error", err => {
            console.log( "[launcher]", err );
            let address:string = err["address" ];
            if( os.platform() !== "linux" ) return;

            if( err[ "code" ] === "EADDRINUSE" && !! address && fs.existsSync( address ) ){
                console.log( "[launcher]", `Try restore address ${ address }...` );

                let check = net.connect({ path: address });
                check.on('error', function( e ) {
                    console.log( "[launcher]", e );
                    if ( e["code"] == 'ECONNREFUSED' ) {
                        fs.unlinkSync( address );
                        console.log( "[elevate]", `Removed ctrl ${ address }`, fs.existsSync( address ) );
                        self.net.listen( address, function() {
                            if( typeof callback === "function" ) callback( address );
                        });
                    }
                });

                check.on( "connect", () => check.end( () => {
                    console.log( "[launcher]", `Try restore address ${ address }... ${ chalk.redBright("FAILED")}` );
                    if( typeof callback === "function" ) callback( address, err );
                }));
            }
        })
    }
    stop( callback?:( err?:Error)=>void){
        this.net.close( callback );
        this.sockets.forEach( value => value.close() );
    }

    protected onAccept(aioSocket: AioSocket<any>, ...param2: any[]) {}

    protected onReject(aioSocket: AioSocket<any>, ...param2: any[]) {}
}