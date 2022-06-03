import {Buffer} from "buffer";
import {proxyOfArray} from "../global/proxy";
import {AioServer, AioServerOpts} from "./server";
import {AioSocket} from "./socket";
import {aio} from "./aio";
import { RestoreOpts, SlotHeader} from "../global/share";
import {nanoid} from "nanoid";

interface Chunk {
    sequence:number,
    buffer:Buffer,
    connection:string
}

export enum AioType {
    AIO_IN="IOType.ANCHOR_IN",
    AIO_OUT="IOType.ANCHOR_OUT"
}

export type AnchorPoint = "CLIENT"|"CONNECTION"|"SERVER";

export function reverseAioType( type:AioType ):AioType {
    if( type === AioType.AIO_IN ) return AioType.AIO_OUT;
    if( type === AioType.AIO_OUT ) return AioType.AIO_IN;
}

export interface AnchorRegisterOpts {
    anchorPoint: AnchorPoint
}


export type OnAnchorError = "KEEP"|"RESTORE"|"END";

export interface AnchorMeta<E> {
    pendents?:Chunk[],
    isAnchorable?:boolean,
    isAnchored?:boolean
    anchorStatus?:"busy"|"free",
    anchorWith?:string,
    anchorWithOrigin?:string,
    anchorRequest?:string,
    anchorConnection:"connected"|"lost"

    auth?: boolean
    status?: "authenticated"|"unknown",
    aioType?:AioType,
    server?:string,
    referer?:string,
    extras?:E,
    anchorPoint?: AnchorPoint,
    onError?:OnAnchorError,
    redirect?(data:Buffer):void
}

export interface NeedAnchorOpts {
    busy?:boolean,
    key?:string,
    restoreRequest?:string,
    // request?:string,
    // connect?:AioType,
    // connectServer:string
}

export type OnNeedAnchor<E> = ( type:AioType, server:string, opts?:NeedAnchorOpts )=> Promise<AioSocket<AnchorMeta<E>>>;

export interface AnchorServerOpts<E> {
    minSlots: number
    maxSlots: number
    anchorPoint?: AnchorPoint,
    onNeedAnchor:OnNeedAnchor<E>,
    chanelOf( server:string ):AioSocket<any>
}


export class AioAnchorServer<E> extends AioServer<AnchorMeta<E>>{
    seq:number = 0;
    private readonly _minSlots:number
    private readonly _maxSlots:number
    private readonly _anchorPoint:AnchorPoint;
    private readonly _anchorOpts:AnchorServerOpts<E>;

    private _needAnchors:{ [p in AioType ]: {[p:string]:({ opts:NeedAnchorOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void})[]}} = {
        [ AioType.AIO_IN ]: proxyOfArray<{ opts:NeedAnchorOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
        [ AioType.AIO_OUT ]: proxyOfArray<{ opts:NeedAnchorOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
    }

    private _restore:{ [p in AioType ]: {[p:string]:({ opts:RestoreOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void})[]}} = {
        [ AioType.AIO_IN ]: proxyOfArray<{ opts:RestoreOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
        [ AioType.AIO_OUT ]: proxyOfArray<{ opts:RestoreOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
    }

    private _aio:{ [p in AioType ]: {[p:string]:string[]}} = {
        [AioType.AIO_IN]: proxyOfArray<string>(),
        [AioType.AIO_OUT]: proxyOfArray<string>(),
    }

    constructor( opts:AioServerOpts&AnchorServerOpts<E> ) {
        super( Object.assign(opts, {
            namespace: opts.namespace||"aio"
        }));

        this._anchorOpts = opts as AnchorServerOpts<E>;
        this._minSlots = opts.minSlots|| 1;
        this._maxSlots = opts.maxSlots|| 1;
        this._anchorPoint = opts.anchorPoint;
    }


    get anchorOpts(): AnchorServerOpts<E> {
        return this._anchorOpts;
    } get minSlots(): number {
        return this._minSlots;
    } get maxSlots(): number {
        return this._maxSlots;
    } get anchorPoint(): AnchorPoint {
        return this._anchorPoint;

    } protected notifyConnection( aioConnection: AioSocket<AnchorMeta<E>> ){
        this.mergeMeta( aioConnection, { auth: false, status: "unknown", pendents: [],anchorConnection: "lost" })
        this._register( aioConnection, { anchorPoint: this.anchorPoint } );

        super.notifyConnection( aioConnection );
    }


    private needAnchor( aioType:AioType, server:string, restoreRequest?:string ):Promise<AioSocket<AnchorMeta<E>>>{
        return new Promise( ( resolve, reject) => {
            let opts:NeedAnchorOpts = {
                key: nanoid( 12 ),
                busy: true,
                restoreRequest
            }

            this._needAnchors[ aioType ][ server ].push( { opts: opts, callback: anchor => {
                    resolve( anchor );
                }});
            this.anchorOpts.onNeedAnchor( aioType, server, opts ).catch();
        });
    }

    private _register( aioSocket:AioSocket<any>, opts:AnchorRegisterOpts ){
        super.mergeMeta( aioSocket, {} as AnchorMeta<E> );
        let aioAnchor:AioSocket<AnchorMeta<E>> = aioSocket;

        if( aioAnchor.meta.isAnchorable ) return aioAnchor;
        aioAnchor.meta.isAnchorable = true;
        aioAnchor.meta.pendents = aioAnchor.meta.pendents || [];
        aioAnchor.meta.anchorStatus = "free";
        aioAnchor.meta.anchorPoint = opts.anchorPoint;

        aioSocket.on("lookup", (err, address) => {  console.log( "===Lookup" ); })
        aioSocket.on("error", (err, address) => {  console.log( "===Error" ); })
        aioSocket.on("data", (err, address) => {  console.log( "===Data" ); })
        aioSocket.on("timeout", (err, address) => {  console.log( "===Timeout" ); })
        aioSocket.on("drain", (err, address) => {  console.log( "===Drain" ); })
        aioSocket.on("connect", (err, address) => {  console.log( "===Connect" ); })
        aioSocket.on("ready", () => {  console.log( "===Ready" ); })
        aioSocket.on("end", () => {  console.log( "===End" ); })
        aioSocket.on("close", () => {  console.log( "===Close" ); })

        aioAnchor.on( "data", ( data:Buffer )=>{
            let capture = aioAnchor.meta.anchorStatus !== "busy" || aioAnchor.meta.pendents.length || aioAnchor.meta.anchorConnection !== "connected";
            // console.log( "ANCHOR-DATA", capture, [
            //     aioAnchor.meta.anchorStatus,
            //         aioAnchor.meta.pendents.length,
            //         aioAnchor.meta.anchorConnection
            //     ], data.toString() );

            if( capture ){
                let pack:Chunk = {
                    sequence: this.seq++,
                    connection: aioAnchor.id,
                    buffer: data
                };
                console.log( "CAPTURED CHUNK", aioAnchor.meta.anchorStatus, aioAnchor.meta.pendents.length, aioAnchor.meta.anchorConnection, data.toString())
                aioAnchor.meta.pendents.push( pack );
            }
        });

        aioAnchor.on( "error", err => {
            console.log( "CONNECTION-ERROR", err.message );
            if( !aioAnchor.meta.isAnchored ) return;
            if( aioAnchor.meta.onError === "KEEP" ) return;

            if( aioAnchor.meta.onError === "END" ) {
                console.log( "STOP CONNECTION START")
                let other = this.of( aioAnchor.meta.anchorWith );
                if( !other ) return;
                other.close();
                return;
            }

            if( aioAnchor.meta.onError === "RESTORE" ){
                console.log( "RESTORE CONNECTION START")
                let current = this.of( aioAnchor.meta.anchorWith );
                if( current ){
                    current.meta.anchorConnection = "lost";
                    current.meta.anchorWith = null;
                    current.off( "data", current.meta.redirect );
                }

                this.needAnchor( aioAnchor.meta.aioType, aioAnchor.meta.server, aioAnchor.meta.anchorRequest ).then( restore => {
                    this.waitAnchor( aioAnchor ).then( other =>{
                        if( !other ) return;
                        if( other.meta.aioType === "IOType.ANCHOR_IN" ) this.anchor( other, restore, aioAnchor.meta.anchorRequest );
                    });
                });
            }

        });

        aioAnchor.on( "end", () => {
            console.log( "ANCHOR-END", aioAnchor.id );
        })

        aioAnchor.on( "close", hadError => {
            // console.log( "ANCHOR-CLOSE", connection.id, hadError );
            if( !aioAnchor.meta.auth ) return;
            if( !aioAnchor.meta.server ) return;

            [ AioType.AIO_IN, AioType.AIO_OUT].forEach( aio =>{
                let index = this._aio[ aio ][ aioAnchor.meta.server ].indexOf( aioAnchor.id );
                if( index === -1 ) return;
                delete this._aio[ aio ][ aioAnchor.meta.server ][ index ]
            });
        });

        return aioAnchor;
    }

    register( connection:AioSocket<any>, opts:AnchorRegisterOpts ):AioSocket<AnchorMeta<E>>{
        this.inject( connection );
        return this._register( connection, opts);
    }


    auth( slots:SlotHeader, referer:string, onError:OnAnchorError ){
        if( !slots.origin ) throw new Error( "[Anchoraio] No slot server identification!" );
        if( !slots.aioType ) throw new Error( "[Anchoraio] No slot aioType marks!" );

        slots.anchors.map( id => {
            return this.of(id);
        } ).forEach( socket => {
            socket.meta.auth = true;
            socket.meta.status = "authenticated";
            socket.meta.aioType = slots.aioType;
            socket.meta.server = slots.origin;
            socket.meta.referer = referer;
            socket.meta.onError = onError;

            if( slots.busy && slots.needOpts?.restoreRequest ){
                socket.meta.anchorStatus = "busy";
                this.restore( slots, socket )
            } else if( slots.busy === socket.id  ) {
                socket.meta.anchorStatus = "busy";
                this.busy( slots, socket );
            } else {
                this._aio[ slots.aioType ][ slots.origin ].push( socket.id );
            }


        });

    }

    private restore( slot:SlotHeader, socket:AioSocket<AnchorMeta<E>> ){
        let restorers = this._restore[ slot.aioType ][ slot.origin ];
        let index = restorers.findIndex( value => {
            return value.opts.request === slot.restore.request
        });
        restorers.splice( index, 1 ).forEach( value => {
            value.callback( socket );
        })
    }

    private busy( slots:SlotHeader, socket:AioSocket<AnchorMeta<E>> ){
        let __needs = this._needAnchors[ slots.aioType ][ slots.origin ];
        let lostIndex = __needs.findIndex( value => value.opts?.key === slots.needOpts.key );
        if( lostIndex === -1 ) return;
        __needs.splice( lostIndex, 1 ).forEach( value => {
            value.callback( socket )
        })
    }


    nextSlot( aioType:AioType, server:string, anchor?:string ):Promise<AioSocket<AnchorMeta<E>>>{
        return new Promise<AioSocket<AnchorMeta<E>>>( (_resolve, reject) => {
            // setTimeout( ()=>{

            // console.log( "GET-NEXT-SLOT", aioType, server, anchor );

            let resolve = ( res )=>{
                res.meta.anchorStatus = "busy";
                _resolve( res );
                let counts = this.counts( aioType, server );
                //TODO descomentar aqui depois
                // if( counts < this._minSlots ) this.needAnchor( aioType, server, {}).catch( err => {
                // });
             }

            let freeSlot:AioSocket<AnchorMeta<E>>;
            if( anchor ) return resolve( this.of( anchor ) );

            let array = this._aio[ aioType ][ server ];

            while ( !freeSlot && array.length ){
                let id = array.shift();
                if( !id ) continue;
                freeSlot = this.of( id );
                if( freeSlot.meta.anchorStatus !== "free" ) freeSlot = null;
            }

            if( freeSlot ) return resolve( freeSlot);

            this.needAnchor( aioType, server ).then( freeSlot => {
                if( !freeSlot ) return resolve( null );
                resolve( freeSlot );
            });

        });
    }

    counts(  type:AioType, server:string ){
        return this._aio[ type ][ server ].filter( value => !!value).length;
    }

    anchor( from:AioSocket<AnchorMeta<E>>, to:AioSocket<AnchorMeta<E>>, anchorRequest:string ){
        if( from.meta.isAnchored && to.meta.isAnchored ) {
            throw new Error( `Connection ${ from.id } already preview anchored!`)
        }

        from.meta.isAnchored = true;
        to.meta.isAnchored = true;

        let fromPendent:Chunk[] = from.meta.pendents || [];
        let toPendent:Chunk[] = to.meta.pendents || [];

        from.meta.redirect = data => to.write( data );
        to.meta.redirect = data => from.write( data );
        from.on( "data", from.meta.redirect );
        to.on( "data", to.meta.redirect );

        // from.pipe( to );
        // to.pipe( from );

        let reverse = { [from.id]: to, [ to.id]: from };
        while ( toPendent.length > 0 || fromPendent.length > 0 ){
            let next:Chunk;
            if( !toPendent.length ) next = fromPendent.shift();
            else if( !fromPendent.length ) next = toPendent.shift();
            else if( toPendent[0].sequence < fromPendent[0].sequence ) next = toPendent.shift();
            else fromPendent.shift();
            reverse[ next.connection ].write( next.buffer );
        }

        [ { _from:from, _to:to }, { _from:to, _to: from }].forEach( value => {
            let { _from, _to } = value;

            _from.meta.anchorStatus = "busy";
            _from.meta.anchorConnection = "connected";
            _from.meta.anchorRequest = anchorRequest;
            _from.meta.anchorWith = _to.id;
            _from.meta.anchorWithOrigin = _to.meta.server;

            _from.on( "end", () => {
                _to.close();
            });
        });

    }


    private waitAnchor( aioAnchor:AioSocket<AnchorMeta<E>> ):Promise<AioSocket<AnchorMeta<E>>> {
        return new Promise( (resolve, reject) => {
            let other = this.findSocketByMeta( (meta, socket) => {
                return ( socket.connected && meta.anchorWith === aioAnchor.id )
                    || ( socket.meta.anchorRequest == aioAnchor.meta.anchorRequest
                        && socket.meta.aioType !== aioAnchor.meta.aioType
                        && socket.id !== aioAnchor.id
                    )
            });

            if( other ) return  resolve( other );
            let restoreOpts:RestoreOpts = { request: aioAnchor.meta.anchorRequest };

            this._restore[ reverseAioType( aioAnchor.meta.aioType ) ][ aioAnchor.meta.anchorWithOrigin ].push( {
                opts:restoreOpts,
                callback: ( socket )=>{
                    resolve( socket )
                }
            })
        });
    }



}