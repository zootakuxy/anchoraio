import {AioCentral} from "./aio-central";
import {AioServer} from "../aio/server";
import {Event, SIMPLE_HEADER} from "../aio/share";
import {AioSocket} from "../aio/socket";
import chalk from "chalk";
import {nanoid} from "nanoid";
import {AioType} from "../aio/anchor-server";
import {lib} from "../aio/lib";
import {TokenService} from "../service/token.service";

export interface CentralMeta{
    server?:string
    referer?:string
    channel?:"primary"|"secondary"|"unknown"
    private?:string
    status:"unknown"|"authenticated"|"rejected",
    channelStatus:"unknown"|"free"|"busy",
    requests:number,
    instance:string
}

export interface PendentOptions {
    origin:string,
    originInstance:string,
}

type PendentAuth = PendentOptions &{
    callback( chanel:AioSocket<CentralMeta> ):void
}

export class AioCentralListener{
    private readonly _server:AioServer<CentralMeta>;
    private readonly _central:AioCentral;
    private readonly _pendentAuth: { [ p:string ]:PendentAuth[]} = lib.proxyOfArray();

    constructor( central:AioCentral ) {
        this._central = central;
        let self = this;
        this._server = new AioServer<any>({
            listen:[ central.opts.serverPort ],
            identifier: "@central",
            sendHeader: true,
            namespace: "agents",
            listenEvent: true,
            auth( aioSocket: AioSocket<any>, args, accept, reject) {
                self.auth( aioSocket, args, accept, reject );
            }
        });

        this._server.onConnection( aioSocket => {
            aioSocket.meta.status = "unknown";
            aioSocket.onListen( Event.AIO, ( args ) => this.onCentralAio( aioSocket, args ));
            aioSocket.onListen( Event.AUTH_CHANEL, ( args ) => this.onCentralAuthChanel( aioSocket, args ) )
            aioSocket.onListen( Event.SLOTS, ( args ) => this.onCentralSlot( aioSocket, args ) )
            aioSocket.onListen( Event.CHANEL_FREE, ( args ) => this.onCentralChanelFree( aioSocket, args) )
            aioSocket.onListen( Event.AIO_ANCHORED, ( args ) => this.onCentralAioAnchored( aioSocket, args ));
            aioSocket.onListen( Event.AIO_REJECTED, ( args ) => this.onCentralAioRejected( aioSocket, args ));
            aioSocket.onListen( Event.AIO_END_ERROR, ( args ) => this.onCentralAioEndError( aioSocket, args ) )
            aioSocket.on("close", hadError => {
                this._central.closeServer( aioSocket );
            });
        });
    }

    public auth( aioSocket: AioSocket<CentralMeta>, args:any, accept:( ...args:any[])=>true, reject:( ...args:any[] )=>false ){

        let result = false;
        if( args.level === "primary" ) return this.onCentralAuth( aioSocket, args ).then( value => {
            if( value.auth ) result = accept( value );
            else result = reject( value )
        });

        if( args.level === "secondary" ) return  this.onCentralAuthChanel( aioSocket, args ).then( value=>{
            if( value.auth ) result = accept( value );
            else result = reject( value );
        });

        if( result ) this.processPendents( aioSocket );
    }

    private processPendents( aioSocket: AioSocket<CentralMeta> ){
        let pendents = this._pendentAuth[ aioSocket.meta.server ];
        pendents.splice(0, pendents.length ).forEach( value => {
            if( !value.origin ) return  value.callback( aioSocket );
            let _origin = this.server.findSocketByMeta( (meta,  socket) => meta.server === value.origin
                && meta.channel === "primary"
            );
            if( !_origin ) return pendents.push( value );
            if( _origin.meta.instance === value.originInstance ) return  value.callback( aioSocket );
            else return value.callback( null );
        });

        Object.keys( this._pendentAuth ).forEach( server => {
            pendents = this._pendentAuth[ server ];
            let index = 0;
            while ( index < pendents.length ){
                let next = pendents[ index ];
                if( !next ) return;
                let chanel = this.chanelOf( server );
                if( !chanel ) return;
                if( !chanel.connected ) return;
                if( !chanel.isAuth() ) return;

                if( next.origin === aioSocket.meta.server &&
                    next.originInstance === aioSocket.meta.instance
                ) {
                    pendents.splice( index, 1 );
                    next.callback( chanel );
                } else index++;
            }
        })
    }


    get server(): AioServer<CentralMeta> {
        return this._server;
    } get central(): AioCentral {
        return this._central;
    }

    private onCentralAuth( aioSocket:AioSocket<CentralMeta>, authData:typeof SIMPLE_HEADER.auth):Promise<typeof SIMPLE_HEADER.authResult > {
        return new Promise( resolve => {
            // aioSocket.pause();
            let reject = ( message:string, code ) =>{
                aioSocket.meta.status = "rejected";
                // aioSocket.resume();
                console.log( "[ANCHORIO] Server>", chalk.redBright( `Auth rejected for agent ${ authData.server }. ${message}!`));
                return resolve({ auth:false, message } );
            }

            if( !authData.server ) return reject( "Missing Agent Identifier", "no:server");
            if( !authData.origin ) return reject( "Missing Origin Identifier", "no:origen");
            if( !authData.instance ) return reject( "Missing Instance Identifier", "no:instance");
            if( !authData.token ) return reject( "Missing Token", "no:origin");
            if( authData.server !== authData.origin ) return reject( "Invalid origin", "bat:origin");

            this.checkToken( authData.server, authData.token ).then( value => {
                if( !value ) return reject( "Invalid token!", "bad:token" );
                let currentAgent = this._server.findSocketByMeta( meta => meta.server === authData.server );

                this._central.closeServer( currentAgent );

                aioSocket.meta.server = authData.server;
                aioSocket.meta.status = "authenticated";
                aioSocket.meta.private = nanoid( 128 );
                aioSocket.meta.channel = "primary";
                aioSocket.meta.instance = authData.instance;
                resolve( {
                    auth: true,
                    anchorPort: this.central.opts.anchorPort,
                    private: aioSocket.meta.private
                } );
                console.log( "[ANCHORIO] Server>", chalk.greenBright( `Agent ${ authData.server } connected with id ${ aioSocket.id } `));
            });
        });
    }

    private onCentralAuthChanel( aioSocket:AioSocket<CentralMeta>, args:typeof SIMPLE_HEADER.auth ):Promise<typeof SIMPLE_HEADER.authResult> {
        return new Promise( resolve => {
            aioSocket.meta.channel = "unknown";
            aioSocket.meta.channelStatus = "unknown";

            let reject = ( message:string )=>{
                aioSocket.close();
                console.log( "[ANCHORIO] Server>", message, chalk.redBright( `Channel auth rejected` ) );
                return resolve({ auth: false, message } );
            }

            if( !args?.server ) return  reject( `Missing server of chanel!` );
            if( !args?.referer ) return reject( `Missing referer of chanel!` );
            if( !args?.instance ) return reject( `Missing instance of chanel!` );
            let primaryChanel = this.server.findSocketByMeta( meta => meta.server === args.server);
            if( !primaryChanel ) return reject( `Server not found for chanel!` );
            if( primaryChanel.id !== args.referer ) return reject( `Invalid referer` );
            if( aioSocket.isAuth() ) return /*aioSocket.resume()*/;

            aioSocket.meta.referer = primaryChanel.id;
            aioSocket.meta.server = primaryChanel.meta.server;
            aioSocket.meta.status = "authenticated";
            aioSocket.meta.channel = "secondary";
            aioSocket.meta.requests = 0;
            aioSocket.meta.channelStatus =  "free";
            aioSocket.meta.instance = args.instance;
            return  resolve({ auth: true, private: nanoid( 128 )});
        });

    }

    private checkToken( server:string, authToken:string ):Promise<boolean>{
        return new Promise<boolean>( resolve =>  {
            let { token } = this.central.tokenService.tokenOf( server  );
            if( !token ) return resolve( false );
            if( token.status !== "active" ) return resolve( false );
            if( authToken !== token.token ) return resolve( false );
            else return resolve( true );
        })
    }

    private onCentralChanelFree( aio:AioSocket<CentralMeta>, data ) {
        if( !aio.isAuth() ) return;
        aio.meta.requests--;
        if( aio.meta.requests < 1 ) aio.meta.channelStatus = "free";

    } private onCentralAio( origin:AioSocket<CentralMeta>, args:typeof SIMPLE_HEADER.aio) {
        if( !origin.isAuth() ) return;
        let reject = ( message )=>{
            console.log( "[ANCHORIO] Server>", chalk.redBright `Anchor of request ${ args.request } from ${ args.anchor_form } to ${ args.server } ${chalk.redBright( "CANCELLED!")}`)
            origin.send( Event.AIO_CANCELLED, Object.assign( args, { canselMessage:message}) );
        }

        let destine = this.chanelOf( args.server );
        if( !destine ) return reject( `Agent Server not found!` );

        destine.meta.channelStatus = "busy";
        destine.meta.requests++;

        let out = this.central.anchorServer.nextSlot( AioType.AIO_OUT, origin.meta.server, args.anchor_form  );
        let _in = this.central.anchorServer.nextSlot( AioType.AIO_IN, destine.meta.server );

        // origin.resume();
        Promise.all([ out, _in ]).then( value => {
            const [ anchorOUT, anchorIN ] = value;
            this.central.anchorServer.anchor( anchorOUT, anchorIN, args.request );
            destine.send( Event.AIO, Object.assign( args, {
                anchor_to: anchorIN.id
            }));
            origin.send( Event.AIO_SEND, args );
            console.log( "[ANCHORIO] Server>",  `Anchor of request ${ args.request } from ${ args.anchor_form } to ${ args.server } ${ chalk.greenBright( "AIO'K" )}`)
        });
    }

    public chanelOf( server:string ): AioSocket<CentralMeta>{
        let primaryChanel = this.server.findSocketByMeta( (meta, socket ) => meta.channel === "primary"
            && meta.server === server
            && !meta.referer
            && socket.connected
            && socket.isAuth()
        );

        if( !primaryChanel ) return;
        let serverChannels = this.server.filterSocketByMeta( ( meta, socket) => meta.channel === "secondary"
            && meta.server === server
            && meta.referer === primaryChanel.id
            && socket.connected
            && socket.isAuth()

        ).sort( (a, b) =>
            a.meta.requests > b.meta.requests? 1
                :a.meta.requests < b.meta.requests? -1
                    :0
        );
        let destine = serverChannels.find( value => value.meta.channelStatus === "free" );
        if( !destine ){
            serverChannels.push( primaryChanel );
            destine = serverChannels.shift();
        }
        return destine;
    }

    public waitChanelOf( server:string, origin?:CentralMeta ): Promise< AioSocket<CentralMeta> >{
        return new Promise<AioSocket<CentralMeta>>(resolve => {
            let chanel = this.chanelOf( server );
            if (chanel) return resolve( chanel );
            let self = this;
            let pendentAuth: PendentAuth = {
                origin: origin?.server,
                originInstance: origin?.instance,
                callback( chanel: AioSocket<CentralMeta>) {
                    resolve( chanel );
                }
            };
            this._pendentAuth[server].push(pendentAuth);
        });
    }

    private onCentralSlot( aioSocket:AioSocket<CentralMeta>, slots:typeof SIMPLE_HEADER.slot ) {
        if( !aioSocket.isAuth() ) return;
        this.central.anchorServer.auth( slots, aioSocket.meta.channel === "primary"? aioSocket.id : aioSocket.meta.referer, { onError: "KEEP", name: `${ slots.aioType }-CONNECTION`} );
        console.log( "[ANCHORIO] Server>", `${ slots.anchors.length } connection anchors registered as ${ slots.aioType } to ${ aioSocket.meta.server }.` );

    }


    start(callback?: () => void) { this._server.start(callback); }
    stop( callback?: (err?: Error) => void) { this._server.stop(callback); }

    private onCentralAioAnchored( aioSocket: AioSocket<CentralMeta>, args:typeof SIMPLE_HEADER.aio) {
        if( !aioSocket.isAuth() ) return;
        this.chanelOf( args.origin )?.send( Event.AIO_ANCHORED, args );

    }

    private onCentralAioRejected(aioSocket: AioSocket<CentralMeta>, args) {
        if( !aioSocket.isAuth() ) return;
        this.chanelOf( args.origin )?.send( Event.AIO_REJECTED, args );
    }

    private onCentralAioEndError( aioSocket: AioSocket<CentralMeta>, args:typeof SIMPLE_HEADER.aioEndError) {
        this.central.anchorServer.filterSocketByMeta( (meta, socket) =>
            meta.anchorRequest === args.request
            && socket.connected
        ).forEach(  value => value.close() );

        this.waitChanelOf( args.replayTo, aioSocket.meta ).then( chanel => {
            if( !chanel ) return;
            chanel.send( Event.AIO_END_ERROR, args );
        });
    }
}