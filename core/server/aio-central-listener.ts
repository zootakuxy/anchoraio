import {AioCentral} from "./aio-central";
import {AioServer} from "../aio/server";
import {Event, SIMPLE_HEADER} from "../aio/share";
import {AioSocket} from "../aio/socket";
import chalk from "chalk";
import {nanoid} from "nanoid";
import {AioType} from "../aio/anchor-server";

export interface CentralMeta{
    server?:string
    referer?:string
    channel?:"primary"|"secondary"|"unknown"
    private?:string
    status:"unknown"|"authenticated"|"rejected",
    channelStatus:"unknown"|"free"|"busy",

    requests:number
}

export class AioCentralListener {
    private readonly _server:AioServer<CentralMeta>;
    private readonly _central:AioCentral;

    constructor( central:AioCentral ) {
        this._central = central;
        let self = this;
        this._server = new AioServer<any>({
            port: central.opts.serverPort,
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
            // aioSocket.pause();
            // aioSocket.onListen( "chunk", chunk => console.log( chunk ))
            aioSocket.onListen( Event.AIO, ( args ) => this.onCentralAio( aioSocket, args ));
            aioSocket.onListen( Event.AUTH_CHANEL, ( args ) => this.onCentralAuthChanel( aioSocket, args ) )
            aioSocket.onListen( Event.SLOTS, ( args ) => this.onCentralSlot( aioSocket, args ) )
            aioSocket.onListen( Event.CHANEL_FREE, ( args ) => this.onCentralChanelFree( aioSocket, args) )
            aioSocket.onListen( Event.AIO_ANCHORED, ( args ) => this.onCentralAioAnchored( aioSocket, args ));
            aioSocket.onListen( Event.AIO_REJECTED, ( args ) => this.onCentralAioRejected( aioSocket, args ));
            aioSocket.on("close", hadError => {
                this._central.closeServer( aioSocket );
            });
            // aioSocket.resume();
        });
    }

    private auth( aioSocket: AioSocket<any>, args:typeof SIMPLE_HEADER.auth, accept, reject ){
        if( args.level === "primary" ) return this.onCentralAuth( aioSocket, args ).then( value => {
            if( value.auth ) accept( value );
            else reject( value );
        });

        if( args.level === "secondary" ) return  this.onCentralAuthChanel( aioSocket, args ).then( value=>{
            if( value.auth ) accept( value );
            else reject( value );
        })
    }


    get server(): AioServer<CentralMeta> {
        return this._server;
    } get central(): AioCentral {
        return this._central;
    }

    private onCentralAuth( aioSocket:AioSocket<CentralMeta>, opts:typeof SIMPLE_HEADER.auth):Promise<typeof SIMPLE_HEADER.authResult > {
        return new Promise( resolve => {
            // aioSocket.pause();
            let reject = ( message:string, code ) =>{
                aioSocket.meta.status = "rejected";
                // aioSocket.resume();
                console.log( "[ANCHORIO] Server>", chalk.redBright( `Auth rejected for agent ${ opts.server }. ${message}!`));
                return resolve({ auth:false, message } );
            }


            if( !opts.server ) return reject( "Missing Agent Identifier", "no:server");
            if( !opts.origin ) return reject( "Missing Origin Identifier", "no:origen");
            if( !opts.token ) return reject( "Missing Token", "no:origin");
            if( opts.server !== opts.origin ) return reject( "Invalid origin", "bat:origin");

            this.checkToken( opts.server, opts.token ).then( value => {
                if( !value ) return reject( "Invalid token!", "bad:token" );
                let currentAgent = this._server.findSocketByMeta( meta => meta.server === opts.server );

                this._central.closeServer( currentAgent );

                aioSocket.meta.server = opts.server;
                aioSocket.meta.status = "authenticated";
                aioSocket.meta.private = nanoid( 128 );
                aioSocket.meta.channel = "primary";
                resolve( {
                    auth: true,
                    anchorPort: this.central.opts.anchorPort,
                    private: aioSocket.meta.private
                } );
                console.log( "[ANCHORIO] Server>", chalk.greenBright( `Agent ${ opts.server } connected with id ${ aioSocket.id } `));
            });
        });
    }

    private checkToken( server:string, token:string ):Promise<boolean>{
        return new Promise<boolean>( resolve =>  {
            if( token !== "1234" ) return resolve( false );
            else return resolve( true );
        })
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
            return  resolve({ auth: true, private: nanoid( 128 )});
        });

    }

    private onCentralChanelFree( aio:AioSocket<CentralMeta>, data ) {
        if( !aio.isAuth() ) return;
        aio.meta.requests--;
        if( aio.meta.requests < 1 ) aio.meta.channelStatus = "free";

    } private onCentralAio( origin:AioSocket<CentralMeta>, args:typeof SIMPLE_HEADER.aio) {
        if( !origin.isAuth() ) return;
        // origin.pause();
        let reject = ( message )=>{
            console.log( "[ANCHORIO] Server>", chalk.redBright `Anchor of request ${ args.request } from ${ args.anchor_form } to ${ args.server } ${chalk.redBright( "CANCELLED!")}`)
            origin.send( Event.AIO_CANCELLED, Object.assign( args, { canselMessage:message}) );
            // origin.resume();
        }

        let agentServer = this.server.findSocketByMeta( meta => meta.server === args.server );
        if( !agentServer ) return reject( `Agent Server not found!` );

        let destine = this.chanelOf( args.server );

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

    public chanelOf( server:string ){
        let primaryChanel = this.server.findSocketByMeta( meta => meta.channel === "primary"
            && meta.server === server
            && !meta.referer
        );
        let serverChannels = this.server.filterSocketByMeta( meta => meta.channel === "secondary"
            && meta.server === server
            && meta.referer === primaryChanel.id
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
}