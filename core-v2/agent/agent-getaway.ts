import net from "net";
import { AuthIO} from "../server/server-proxy";
import {AgentAio} from "./agent-aio";
import {Resolved} from "../dns/aio.resolve";
import {BaseEventEmitter} from "kitres/src/core/util";
import {Defaults} from "../defaults";
import {asAnchorSocket, AnchorSocket, identifierOf, anchor} from "../net/anchor";

export type AgentProxyOptions = {
    requestPort:number,
    responsePort:number,
    serverHost:string,
    anchorPort:number,
    identifier:string,
    restoreTimeout: number,
    directConnection: "on"|"off"
}


type ConnectionOptions =  {
    server:string,
    application:string,
    requestData:any[],
    dataListen:( data )=>void
}

type GetAway = {
    connection:AnchorSocket<{anchored?:boolean,readyToAnchor?:boolean}>,
    id:string
    busy:boolean
    autoReconnect:boolean
}

type GetAwayOptions = {
    server:string,
    application:string,
    autoReconnect:boolean
}

type NeedGetAway = {
    hasRequest:boolean,
    timeout
}

type GetawayListener = {
    callback:( getAway:GetAway)=> void,
    id:string,
    request:AnchorSocket<{anchored?:boolean}>,
    busy: boolean,
    server:string,
    application:string
}

interface AgentProxyListener{
    getAwayRegister( getAway:GetAway )
}


export class AgentGetaway extends BaseEventEmitter<AgentProxyListener>{
    private opts:AgentProxyOptions;
    private anchor:net.Server;
    private _connectionListener:<T extends { anchored?:boolean }>( socket:AnchorSocket<T> ) => void
    private readonly getawaysConnections: {
        [p:string]:AnchorSocket<{anchored?:boolean}>
    };

    private readonly needGetAway : {
        [ server:string ]:{
            [ app:string ]: NeedGetAway
        }
    };

    private readonly getaway:{
        [ server:string ]:{
            [ app:string ]: {
                [ id:string ]:GetAway
            }
        }
    }

    private readonly getawayListener:{
        [ server:string ]:{
            [application:string]:{
                [ listenerId:string ]: GetawayListener
            }
        }
    }

    private status:"started"|"stopped" = "stopped";
    private aio: AgentAio;

    constructor( aio:AgentAio, opts: AgentProxyOptions) {
        super();
        this.aio = aio;
        if( !opts.restoreTimeout ) opts.restoreTimeout = Defaults.restoreTimeout;
        this.opts = opts;
        this.anchor = new net.Server();
        this.getawaysConnections = {};

        this.getaway = new Proxy({},{
            get(target: {}, server: string | symbol, receiver: any): any {
                if( !target[server]) target[ server ] = new Proxy({}, {
                    get(target: {}, application: string | symbol, receiver: any): any {
                        if( !target[application] ) target[application ] = {}
                        return target[ application ];
                    }
                })
                return target[server];
            }
        });
        this.getawayListener = new Proxy({},{
            get(target: {}, server: string | symbol, receiver: any): any {
                if( !target[server]) target[ server] = new Proxy({}, {
                    get(target: {}, application: string | symbol, receiver: any): any {
                        if( !target[application] ) target[application ] = {}
                        return target[ application ];
                    }
                })
                return target[server];
            }
        });
        this.needGetAway = new Proxy({},{
            get(target: {}, server: string | symbol, receiver: any): any {
                if( !server.toString().endsWith(".aio")) throw new Error("server "+server.toString()+" not end with .aio")
                if( !target[server]) target[ server] = new Proxy({}, {
                    get(target: {}, application: string | symbol, receiver: any): any {
                        if( !target[application] ) target[application ] = {}
                        return target[ application ];
                    }
                })
                return target[server];
            }
        });
        this.listen();
    }

    resolve( address:string ){
        return this.aio.aioResolve.resolved( address );
    }

    private listen(){
        this._connectionListener = _so => {
            let request = asAnchorSocket( _so, {
                side: "server",
                method: "REQ",
                props:{ anchored: false } } );
            this.getawaysConnections[ request.id() ] = request;
            const remoteAddressParts = request.address()["address"].split( ":" );
            const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
            // console.log( "NEW REQUEST ON AGENT IN ADDRESS", address );

            let resolved = this.resolve( address );

            if( !resolved ){
                // console.log( `Address ${ address } not resolved!` );
                request.end();
                return;
            }

            console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost } RECEIVED-REQUEST`);
            let dataListen = data =>{
                requestData.push( data );
            }
            request.on("data", dataListen );
            request.on("close", hadError => {
                delete this.getawaysConnections[ request.id() ];
            })

            //get server and app by address
            let requestData = [];


            request.on( "error", err => {
                console.log( "request-error", err.message );
            });

            if( resolved.identifier === this.aio.identifier && this.opts.directConnection === "on" ){
                return this.directConnect( request, {
                    server: this.aio.identifier,
                    application: resolved.application,
                    dataListen:dataListen,
                    requestData: requestData
                })
            }

            this.openDemandedGetaway( resolved, request );
            this.connect( request, {
                server: resolved.identifier,
                application: resolved.application,
                dataListen: dataListen,
                requestData: requestData,
            }, resolved );


            if( resolved.requestTimeout === "never" ) return;

            setTimeout(()=>{
                if( request.status() === "connected" && !request.props().anchored ){
                    request.end();
                }
            }, resolved.requestTimeout );
        };
    }

    private openDemandedGetaway( resolved:Resolved, request:AnchorSocket<{ anchored?:boolean }> ){
        let needGetAway = this.needGetAway[ resolved.identifier ][ resolved.application ];
        if( !needGetAway.hasRequest ) {
            console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost }  REQUIRING GETAWAY`)
            needGetAway.hasRequest = true;
            for (let i = 0; i < 1; i++) {
                this.openGetAway( {
                    server: resolved.identifier,
                    application: resolved.application,
                    autoReconnect: false
                }, resolved )
            }

            for (let i = 0; i < resolved.getawayRelease; i++) {
                this.openGetAway( {
                    server: resolved.identifier,
                    application: resolved.application,
                    autoReconnect: true
                }, resolved )
            }
        }

        if( resolved.getawayReleaseTimeout === "never" ) return;
        needGetAway.timeout = setTimeout( ()=>{
            needGetAway.hasRequest = false;
            Object.entries( this.getaway[resolved.identifier][resolved.application]).map( ([key, getAway]) => getAway )
                .filter( value => !value.connection.props().anchored && value.connection.status() === "connected")
                .forEach( (value) => {
                    console.log("PREPARED GETAWAY ABORTED!");
                    value.connection.destroy( new Error("ABORTEDGETAWAY"));
                });
        }, Number( resolved.getawayReleaseTimeout)  );
    }

    private directConnect(request:AnchorSocket<{anchored?:boolean}>, opts:ConnectionOptions ){
        let app = this.aio.apps.applications().find( value => value.name == opts.application );
        if( !app ) return request.end();
        let response = asAnchorSocket( net.connect( {
            host: app.address,
            port: app.port
        }), {
            side: "client",
            method: "RESP"
        });
        anchor( `${opts.application}.${ opts.server }`, "AGENT-CLIENT-DIRECT", request, response, opts.requestData, [ ]);
    }

    private registerGetAway( opts:GetAwayOptions, connection:AnchorSocket<{
        anchored?:boolean,
        application?:string,
        server?:string
    }> ){
        let [key, next ] = Object.entries( this.getawayListener[opts.server][ opts.application ] )
            .find( ([listerId, getawayListener], index) => {
                return !getawayListener.busy
                    && getawayListener.request.status() === "connected";
            })||[]
        connection.props().application = opts.application;
        connection.props().server = opts.server;
        if( !!next ) {
            next.busy = true;
            delete this.getawayListener[opts.server][ opts.application ][  next.id ];
            next.callback( {
                busy: true,
                connection: connection ,
                id: connection.id(),
                autoReconnect: opts.autoReconnect
            });
            return;
        }

        let getAway:GetAway = {
            id: connection.id(),
            connection,
            busy: false,
            autoReconnect: opts.autoReconnect
        };

        this.getaway[ opts.server ][ opts.application ][ connection.id() ] = getAway

        connection.on( "close", () => {
            delete this.getaway[ opts.server ][ opts.application ][ connection.id() ];
        });

        this.notify("getAwayRegister", getAway );
    }

    private onGetAway(server:string, application:string, resolved:Resolved, request:AnchorSocket<{anchored?:boolean}>, callback:(getAway:GetAway )=>void ){
        let next = Object.entries( this.getaway[server][application]).find( ([key, getAway], index) => {
            return !getAway.busy
                && !!getAway.connection.props().readyToAnchor;
        });

        if( !!next ){
            console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost }  IMMEDIATELY CONNECT`)
            let [ key, getAway ] = next;
            getAway.busy = true;
            delete this.getaway[ server ][ application ][ key ];
            callback( getAway );
            return;
        }
        console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost } WAIT FOR GETAWAY`)
        this.getawayListener[ server] [ application ][ request.id() ] = {
            id: request.id(),
            request: request,
            server: server,
            application: application,
            busy: false,
            callback: callback
        };

        request.on( "close", hadError => {
            delete this.getawayListener[ server] [ application ][ request.id() ];
        });
    }


    public openGetAway ( opts:GetAwayOptions, resolved:Resolved ){
        let hasRequest = this.needGetAway[ opts.server ][ opts.application ].hasRequest;
        if( resolved.getawayReleaseOnDiscover ) hasRequest = true;

        if(!this.aio.openedServes.includes( opts.server ) ) return;
        if(resolved.identifier === this.aio.identifier && this.opts.directConnection === "on" ) return;
        if(!hasRequest ) return;

        let connection = asAnchorSocket(  net.connect( {
            host: this.opts.serverHost,
            port: this.opts.requestPort
        }), {
            side: "client",
            method:"SET",
            props: {
                anchored: false,
                readyToAnchor: false
            }
        });

        connection.on( "connect", () => {

            //MODO wait response SERVSER
            let redirect:AuthIO = {
                server: identifierOf( opts.server ),
                app: opts.application,
                authReferer: this.aio.authReferer,
                authId: connection.id(),
                origin: identifierOf( this.opts.identifier )
            }


            connection.write( JSON.stringify( redirect ) );
            connection.once( "data", ( data ) => {
                connection.props().readyToAnchor = true;

                this.registerGetAway( opts, connection );
            });
        });

        connection.on("error", err => {
            console.log( "request-to-anchor-error", err.message );
        });

        connection.on( "close", hadError => {
            if( !connection.props().anchored && opts.autoReconnect ) {
                setTimeout ( ()=>{
                    this.openGetAway( opts, resolved );
                }, this.opts.restoreTimeout  );
            }
        });
    }

    private connect ( request, opts:ConnectionOptions, resolved:Resolved ){
        this.onGetAway( opts.server, opts.application,  resolved, request,getAway => {
            anchor( `${opts.application}.${ opts.server }`, "AGENT-CLIENT", request, getAway.connection, opts.requestData, []);

            request.off( "data", opts.dataListen );
            if( getAway.autoReconnect ){
                this.openGetAway( {
                    server: opts.server,
                    application: opts.application,
                    autoReconnect: getAway.autoReconnect
                }, resolved );
            }
        });
    }
    start(){
        this.anchor.on( "connection", this._connectionListener );
        this.anchor.listen( this.opts.anchorPort );
        this.status = "started";
    }

    stop(){
        this.status = "stopped";
        this.anchor.off( "connection", this._connectionListener );
        Object.entries( this.getawaysConnections ).forEach( ([key, request], index) => {
            request.end();
        });
        this.anchor.close( err => {
            if( err ) console.log( "Error on end anchor server", err.message );
            else console.log( "Anchor server stop with success!" );
        });
    }
}