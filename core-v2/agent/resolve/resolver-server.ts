import {AgentAio} from "../agent-aio";
import {Resolved} from "./index";
import {BaseEventEmitter} from "kitres/src/core/util";
import {Defaults} from "../../defaults";
import {createAnchorConnect, AnchorSocket, identifierOf, anchor, RequestGetawayAuth, asAnchorConnect} from "../../net";
import {AIOServer} from "../../net/server";
import {application, response} from "express";

export type AgentProxyOptions = {
    requestPort:number,
    responsePort:number,
    serverHost:string,
    anchorPort:number|number[],
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
    connection:AnchorSocket<{
        readyToAnchor?:boolean
        application?:string
        server?:string
    }>,
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
    request:AnchorSocket<{}>,
    busy: boolean,
    server:string,
    application:string
}

interface AgentProxyListener{
    getAwayRegister( getAway:GetAway )
}


export class ResolverServer extends BaseEventEmitter<AgentProxyListener>{
    private opts:AgentProxyOptions;
    private anchor:AIOServer;
    private _connectionListener:<T>( socket:AnchorSocket<T> ) => void
    private readonly requestConnections: {
        [p:string]:AnchorSocket<{
            server?:string,
            application?:string
            address?:string
        }>
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
        this.anchor = new AIOServer({
            safe: true
        });
        this.requestConnections = {};

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
            let request:typeof this.requestConnections[number] = asAnchorConnect( _so, {
                side: "server",
                method: "REQ",
            } );
            this.requestConnections[ request.id() ] = request;
            const remoteAddressParts = request.address()["address"].split( ":" );
            const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
            // console.log( "NEW REQUEST ON AGENT IN ADDRESS", address );

            let resolved = this.resolve( address );

            if( !resolved ){
                // console.log( `Address ${ address } not resolved!` );
                request.end();
                return;
            }

            //get server and app by address
            let requestData = [];
            let dataListen = data =>{
                requestData.push( data );
            }


            if( resolved.identifier === this.aio.identifier ){
                return this.directConnect( request, {
                    server: this.aio.identifier,
                    application: resolved.application,
                    dataListen: dataListen,
                    requestData: requestData
                })
            }

            console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost } RECEIVED-REQUEST`);
            let resolveServer = this.aio.availableRemoteServers.find( value => {
                return value.server === resolved.identifier
            });

            //Servidor offline
            if( !resolveServer) {
                console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost } CANCELED | RESOLVE SERVER IS OFFLINE`);
                return  request.end()
            }

            //Permission dainet
            if( !resolveServer.apps.has( resolved.application ) ) {
                console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost } CANCELED | PERMISSION DINED FOR APPLICATION`);
                return request.end()
            }

            request.on("data", dataListen );
            request.on("close", hadError => {
                delete this.requestConnections[ request.id() ];
            })

            request.on( "error", err => {
                console.log( "request-error", err.message );
            });

            request.props({
                server: resolved.server,
                application: resolved.application,
                address: resolved.address
            });

            this.releaseGetaways( resolved, request );
            this.connect( request, {
                server: resolved.identifier,
                application: resolved.application,
                dataListen: dataListen,
                requestData: requestData,
            }, resolved );


            if( resolved.requestTimeout === "never" ) return;

            setTimeout(()=>{
                if( request.status() === "connected" && !request.anchored() ){
                    request.end();
                }
            }, resolved.requestTimeout );
        };
    }

    private releaseGetaways( resolved:Resolved, request:AnchorSocket<{}> ){
        let needGetAway = this.needGetAway[ resolved.identifier ][ resolved.application ];
        console.log( "releaseGetaways|needGetAway.hasRequest", needGetAway.hasRequest )
        if( !needGetAway.hasRequest ) {
            console.log( `REQUEST ${ request.id() } TO ${ resolved.aioHost }  REQUIRING GETAWAY`)
            if(needGetAway.timeout ) clearTimeout( needGetAway.timeout )
            needGetAway.hasRequest = true;
            this.openGetAway( {
                server: resolved.identifier,
                application: resolved.application,
                autoReconnect: false
            }, resolved )

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
            needGetAway.timeout = null;
            needGetAway.hasRequest = false;
            Object.entries( this.getaway[ resolved.identifier ][ resolved.application ]).map( ([key, getAway]) => getAway )
                .filter( getAway => !getAway.connection.anchored() && getAway.connection.status() === "connected")
                .forEach( ( getAway) => {
                    console.log( "PREPARED GETAWAY ABORTED!" );
                    getAway.connection.destroy( new Error("ABORTEDGETAWAY"));
                });
        }, Number( resolved.getawayReleaseTimeout)  );
    }

    private directConnect(request:AnchorSocket<{}>, opts:ConnectionOptions ){
        let app = this.aio.apps.applications().find( value => value.name == opts.application );
        if( !app ) return request.end();
        let response = createAnchorConnect( {
            host: app.address,
            port: app.port,
            side: "client",
            method: "RESP"
        });
        anchor( `${opts.application}.${ opts.server }`, "AGENT-CLIENT-DIRECT", request, response, opts.requestData, [ ]);
    }

    private registerGetAway( opts:GetAwayOptions, connection:AnchorSocket<{
        application?:string,
        server?:string
        readyToAnchor:boolean
    }> ){
        console.log( `agent:registerGetAway server = "${opts.server}" application = "${opts.application}"`)
        let [key, next ] = Object.entries( this.getawayListener[ opts.server ][ opts.application ] )
            .find( ([, getawayListener], index) => {
                return !getawayListener.busy
                    && getawayListener.request.status() === "connected";
            })||[]
        connection.props().application = opts.application;
        connection.props().server = opts.server;
        if( !!next ) {
            console.log(`OPEN GETAWAY TO ${opts.application}.${ opts.server } RESOLVE IMMEDIATE: ${ next.request.id() }`)

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

        console.log(`OPEN GETAWAY TO ${opts.application}.${ opts.server } REGISTERED`)


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

    private onGetAway(server:string, application:string, resolved:Resolved, request:AnchorSocket<{}>, callback:(getAway:GetAway )=>void ){
        console.log( `agent.onGetAway server = "${server}" application="${application}"`)
        let next = Object.entries( this.getaway[ server ][application]).find( ([, getAway], index) => {
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
        console.log( "agent.openGetAway");
        let hasRequest = this.needGetAway[ opts.server ][ opts.application ].hasRequest;
        if( resolved.getawayReleaseOnDiscover ) hasRequest = true;
        let hasServerOnline = this.aio.availableRemoteServers.find(  value => {
            return value.server === opts.server
                && value.apps.has( resolved.application );
        } )
        // let remotelyOnly = resolved.identifier === this.aio.identifier && this.opts.directConnection === "on";


        let openGetAwayDined = ( message:string)=>{
            console.log( `agent.openGetAway:openGetAwayDined message = "${message}"`);
        }

        if( !hasServerOnline ) return openGetAwayDined( "Server is offline!");
        // if( remotelyOnly ) return openGetAwayDined();
        if( !hasRequest ) return openGetAwayDined( "No requests connections opens!" );

        let connection = createAnchorConnect({
            host: this.opts.serverHost,
            port: this.opts.requestPort,
            side: "client",
            method:"SET",
            props: {
                readyToAnchor: false
            }
        });

        connection.on( "connect", () => {
            console.log( "agent.openGetAway:connect" );

            //MODO wait response SERVSER
            let redirect:RequestGetawayAuth = {
                server: identifierOf( opts.server ),
                app: opts.application,
                authReferer: this.aio.authReferer,
                authId: connection.id(),
                origin: identifierOf( this.opts.identifier ),
                machine: this.aio.machine()
            }

            connection.write( JSON.stringify( redirect ) );
            connection.once( "data", ( data ) => {
                console.log( "agent.openGetAway:ready" );
                connection.props().readyToAnchor = true;
                this.registerGetAway( opts, connection );
            });
        });

        connection.on("error", err => {
            console.log( "request-to-anchor-error", err.message );
        });

        connection.on( "close", hadError => {
            if( !connection.anchored() && opts.autoReconnect && !!hadError ) {
                setTimeout ( ()=>{
                    this.openGetAway( opts, resolved );
                }, this.opts.restoreTimeout  );
            }
        });
    }

    private connect ( request, opts:ConnectionOptions, resolved:Resolved ){
        console.log( `agent.connect | application = "${ resolved.application }" server = "${ resolved.identifier }"` );
        this.onGetAway( opts.server, opts.application,  resolved, request,getAway => {
            getAway.connection.on( "data", data => {
                console.log( "=================== [ AGENT:RESPONSE FOR REQUEST GETAWAY ] ===================")
                console.log( data.toString() );
                console.log( "=================== [                                    ] ===================")
            });
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
        let _ports:number[];

        if( Array.isArray( this.opts.anchorPort ) ) _ports = this.opts.anchorPort.map( value => Number( value ));
        else _ports = [ Number( this.opts.anchorPort) ];
        this.anchor.listen(  ( port ) => {
            console.log( `AIO agent listen anchor on aio://127.*.*.*:${ port }`)
        }, ..._ports);
        this.status = "started";
    }

    stop(){
        this.status = "stopped";
        this.anchor.off( "connection", this._connectionListener );
        this.closeAll();
        Object.entries( this.requestConnections ).forEach( ([key, request], index) => {
            request.end();
        });
        this.anchor.close( err => {
            if( err ) console.log( "Error on end anchor server", err.message );
            else console.log( "Anchor server stop with success!" );
        });
    }

    closeGetaway( opts: CloseGetawayOptions) {
        let needGetAway = this.needGetAway[ opts.server ][ opts.application ];
        needGetAway.hasRequest = false;
        if(needGetAway.timeout ) clearTimeout( needGetAway.timeout )
        Object.entries( this.getaway[ opts.server ] [ opts.application ] ).forEach( ([key, getaway]) => {
            getaway.connection.end();
        })
    }

    closeAll() {
        Object.keys( this.getaway ).forEach( server => {
            Object.keys( this.getaway[ server ] ).forEach( application => {
                this.closeGetaway({
                    application,
                    server
                })
            })
        })
    }
}

export type CloseGetawayOptions = {
    application:string,
    server:string
}