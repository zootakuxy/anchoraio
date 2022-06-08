import {Buffer} from "buffer";
import {AioServer, AioServerOpts} from "./server";
import {AioSocket} from "./socket";
import {aio} from "./aio";
import {Event, HEADER, RestoreOpts, SIMPLE_HEADER} from "./share";
import {nanoid} from "nanoid";
import chalk from "chalk";
import {lib} from "./lib";

type ListenEvent = "data"|"ready"|"end"
interface Chunk {
    sequence:number,
    buffer?:Buffer,
    connection:string,
    event:ListenEvent
}

export enum AioType {
    AIO_IN="AioType.AIO_IN",
    AIO_OUT="AioType.AIO_OUT"
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
    anchorName?:string
    dataRedirect?(data:Buffer):void
    endRedirect?():void
}

export interface NeedAnchorOpts {
    busy?:boolean,
    key?:string,
    restoreRequest?:string,
    // request?:string,
    // connect?:AioType,
    // connectServer:string
}

export type AnchorSide = "REQUEST"|"AGENT-OUT"|"SERVER-IN"|"SERVER-OUT"|"AGENT-IN"|"RESPONSE";


export type OnNeedAnchor<E> = ( type:AioType, server:string, opts?:NeedAnchorOpts )=> Promise<AioSocket<AnchorMeta<E>>>;

export interface AnchorServerOpts<E> {
    minSlots: number
    maxSlots: number
    anchorPoint?: AnchorPoint,
    onNeedAnchor:OnNeedAnchor<E>,
    emit( server:string, event:Event, ...data:any[] )
}

export interface AnchorAuthOption {
    name:string,
    onError:OnAnchorError
}


export class AioAnchorServer<E> extends AioServer<AnchorMeta<E>>{
    seq:number = 0;
    private readonly _minSlots:number
    private readonly _maxSlots:number
    private readonly _anchorPoint:AnchorPoint;
    private readonly _anchorOpts:AnchorServerOpts<E>;

    private _needAnchors:{ [p in AioType ]: {[p:string]:({ opts:NeedAnchorOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void})[]}} = {
        [ AioType.AIO_IN ]: lib.proxyOfArray<{ opts:NeedAnchorOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
        [ AioType.AIO_OUT ]: lib.proxyOfArray<{ opts:NeedAnchorOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
    }

    private _restore:{ [p in AioType ]: {[p:string]:({ opts:RestoreOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void})[]}} = {
        [ AioType.AIO_IN ]:  lib.proxyOfArray<{ opts:RestoreOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
        [ AioType.AIO_OUT ]: lib.proxyOfArray<{ opts:RestoreOpts, callback:( anchor:AioSocket<AnchorMeta<E>>)=>void}>(),
    }

    private _aio:{ [p in AioType ]: {[p:string]:string[]}} = {
        [AioType.AIO_IN]:  lib.proxyOfArray<string>(),
        [AioType.AIO_OUT]: lib.proxyOfArray<string>(),
    }

    constructor( opts:AioServerOpts&AnchorServerOpts<E> ) {
        super( Object.assign(opts, {
            namespace: opts.namespace||"aio"
        }));

        this._anchorOpts = opts as AnchorServerOpts<E>;
        this._minSlots = opts.minSlots||0;
        this._maxSlots = opts.maxSlots||0;
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

    } protected onAttach(aioSocket: AioSocket<AnchorMeta<E>>) {
        this.mergeMeta( aioSocket, { auth: false, status: "unknown", pendents: [],anchorConnection: "lost" })
        this._register( aioSocket, { anchorPoint: this.anchorPoint } );
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

    private openAnchor( aioType:AioType, server:string ):Promise<AioSocket<AnchorMeta<E>>>{
        return new Promise( ( resolve, reject) => {
            let opts:NeedAnchorOpts = {}
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

        let capture = ( event:ListenEvent, data?:Buffer )=>{
            let capture = aioAnchor.meta.anchorStatus !== "busy" || aioAnchor.meta.pendents.length || aioAnchor.meta.anchorConnection !== "connected";
            if( capture ){
                let pack:Chunk = {
                    sequence: this.seq++,
                    connection: aioAnchor.id,
                    buffer: data,
                    event: event
                };
                // console.log( "CAPTURED CHUNK", aioAnchor.meta.anchorStatus, aioAnchor.meta.pendents.length, aioAnchor.meta.anchorConnection, data.toString())
                aioAnchor.meta.pendents.push( pack );
            }
        }

        aioAnchor.on( "data", ( data:Buffer )=>{ capture( "data", data ); });
        aioAnchor.on( "end", () => capture( "end" ) );

        aioAnchor.on( "error", err => {
            if( !aioAnchor.meta.isAnchored ) return;
            if( aioAnchor.meta.onError === "KEEP" ) return;

            if( aioAnchor.meta.onError === "END" ) {
                let other = this.of( aioAnchor.meta.anchorWith );
                if( other ) other.close();
                this.anchorOpts.emit( aioAnchor.meta.anchorWithOrigin, Event.AIO_END_ERROR, HEADER.aioEndError({
                    request: aioAnchor.meta.anchorRequest,
                    replayTo: aioAnchor.meta.anchorWithOrigin,
                    origin: aioAnchor.meta.server
                }));

                console.log( "[ANCHORIO] Stop anchored par by error" );
                return;
            }

            if( aioAnchor.meta.onError === "RESTORE" ){
                console.log( "[ANCHORIO]", `Restore connection for request ${ aioAnchor.meta.anchorRequest } ...` );
                let current = this.of( aioAnchor.meta.anchorWith );
                if( current ){
                    current.meta.anchorConnection = "lost";
                    current.meta.anchorWith = null;
                    current.off( "data", current.meta.dataRedirect );
                }

                this.needAnchor( aioAnchor.meta.aioType, aioAnchor.meta.server, aioAnchor.meta.anchorRequest ).then( restore => {
                    restore.meta.anchorRequest = aioAnchor.meta.anchorRequest;
                    this.waitAnchor( restore, aioAnchor.meta.anchorRequest ).then( other =>{
                        if( other.meta.anchorConnection === "connected" || restore.meta.anchorConnection === "connected" ) return;
                        this.restoreNow( restore, other, aioAnchor.meta.anchorRequest );
                    });
                });
            }

        });

        aioAnchor.on( "end", () => {

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


    auth( slots: typeof SIMPLE_HEADER.slot, referer:string, opts:AnchorAuthOption ){
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
            socket.meta.onError = opts.onError;
            socket.meta.anchorName = opts.name;

            if( slots.busy === socket.id  ) {
                socket.meta.anchorStatus = "busy";
                this.busy( slots, socket );
            } else this._aio[ slots.aioType ][ slots.origin ].push( socket.id );

            if( slots.busy && slots.needOpts?.restoreRequest ){
                socket.meta.anchorStatus = "busy";
                socket.meta.anchorRequest = slots.needOpts?.restoreRequest;
                this.restore( slots, socket )
            }
        });

    }

    /** //Essa funcçao serve rapar aplicar os restauros pendetentes */
    private restore( slot:typeof SIMPLE_HEADER.slot, restore:AioSocket<AnchorMeta<E>> ){
        //Procurar e aplicar os restauros pendentes
        let restorers = this._restore[ slot.aioType ][ slot.origin ];

        let _restores = restorers.splice( restorers.findIndex( value => {
            return value.opts.request === slot.restore.request
        }), 1 );

        //Quando encontrado restauros pendente aplica-los
        if( _restores.length ){
            _restores[0].callback( restore );
            return;
        }

        //Quando não encontrar nenhum restaure pendente procurar por conexões quebrada que mativerão-se na espera
        let other = this.otherOf( restore, slot.needOpts.restoreRequest );
        if( !other ) return;
        if( other.meta.isAnchored && restore.meta.isAnchored ) return;
        this.restoreNow( restore, other, slot.needOpts.restoreRequest );
    }

    restoreNow( restore:AioSocket<AnchorMeta<E>>, other:AioSocket<AnchorMeta<E>>, request:string){
        if( other.meta.aioType === AioType.AIO_IN ) this.anchor( other, restore, request );
        else this.anchor( restore, other, request );
        console.log( "[ANCHORIO]", `Restore connection for request ${ restore.meta.anchorRequest } ... ${ chalk.greenBright("CONNECTION RESTORED!")}` );
    }

    private busy( slots: typeof SIMPLE_HEADER.slot, socket:AioSocket<AnchorMeta<E>> ){
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
                if( counts < this._minSlots ) this.openAnchor( aioType, server ).catch( err => {});
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

        this.pipe( from, to, anchorRequest );

        let reverse = { [from.id]: to, [ to.id]: from };
        while ( toPendent.length > 0 || fromPendent.length > 0 ){
            let next:Chunk;
            if( !toPendent.length ) next = fromPendent.shift();
            else if( !fromPendent.length ) next = toPendent.shift();
            else if( toPendent[0].sequence < fromPendent[0].sequence ) next = toPendent.shift();
            else next = fromPendent.shift();
            if( !next ) break;

            if ( next.event === "data" ) reverse[ next.connection ].write( next.buffer );
            else if( next.event === "ready" ) reverse[ next.connection ].emit( "ready" );
            else if( next.event === "end" ) reverse[ next.connection ].close();
        }
    }

    private pipe( from:AioSocket<AnchorMeta<E>>, to:AioSocket<AnchorMeta<E>>, anchorRequest:string ){
        [ { _from:from, _to:to }, { _from:to, _to: from }].forEach( value => {
            let { _from, _to } = value;

            _from.meta.dataRedirect = data => {
                if( _from.meta.pendents.length ) return;
                _to.write( data );
            }

            _from.meta.endRedirect = () =>{
                if( _from.meta.pendents.length ) return;
                _to.close();
            }

            _from.on( "data", _from.meta.dataRedirect );
            _from.on( "end", _from.meta.endRedirect );

            _from.meta.anchorStatus = "busy";
            _from.meta.anchorConnection = "connected";
            _from.meta.anchorRequest = anchorRequest;
            _from.meta.anchorWith = _to.id;
            _from.meta.anchorWithOrigin = _to.meta.server;
        });
    }

    private otherOf( restore:AioSocket<AnchorMeta<E>>, request:string ):AioSocket<AnchorMeta<E>>{
        return this.findSocketByMeta((meta, next) => {
            return (next.connected && meta.anchorWith === restore.id)
                || (next.meta.anchorRequest == request
                    && next.meta.aioType !== restore.meta.aioType
                    && next.id !== restore.id
                    && next.connected
                    && next.meta.anchorConnection !== "connected"
                )
        });
    }


    private waitAnchor( restore:AioSocket<AnchorMeta<E>>, request:string ):Promise<AioSocket<AnchorMeta<E>>> {
        return new Promise( (resolve) => {
            let other = this.otherOf( restore, request )

            if( other ) return  resolve( other );
            let restoreOpts:RestoreOpts = { request: request };

            this._restore[ reverseAioType( restore.meta.aioType ) ][ restore.meta.anchorWithOrigin ].push( {
                opts:restoreOpts,
                callback: ( socket )=>{
                    resolve( socket )
                }
            })
        });
    }



}