import net from "net";
import {anchor, AuthIO, ConnectionBusy, identifierOf} from "../server/server-proxy";
import {nanoid} from "nanoid";
import {AgentAio} from "./agent-aio";
import {App} from "../applications";
import {Resolved} from "../dns/aio.resolve";
import {BaseEventEmitter} from "kitres/src/core/util";
import {Defaults} from "../defaults";

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
    connection:net.Socket,
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

interface AgentProxyListener{
    getAwayRegister( getAway:GetAway )
}


export class AgentProxy extends BaseEventEmitter<AgentProxyListener>{
    private opts:AgentProxyOptions;
    private anchor:net.Server;
    private readonly appsConnections:{ [ p:string ]:net.Socket };
    private authKey:string;
    private _connectionListener:( socket:net.Socket ) => void
    private readonly connections: {
        [p:string]:net.Socket
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

    private readonly waitGetAway:{
        [ server:string ]:{
            [application:string]:(( getAway:GetAway)=> void) [ ]
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
        this.connections = {};
        this.appsConnections = {};

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
        this.waitGetAway = new Proxy({},{
            get(target: {}, server: string | symbol, receiver: any): any {
                if( !target[server]) target[ server] = new Proxy({}, {
                    get(target: {}, application: string | symbol, receiver: any): any {
                        if( !target[application] ) target[application ] = []
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
        this._connectionListener = request => {
            request["id"] = `REQ:${nanoid( 16 )}`;
            this.connections[ request["id"] ] = request;
            const remoteAddressParts = request.address()["address"].split( ":" );
            const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
            // console.log( "NEW REQUEST ON AGENT IN ADDRESS", address );

            let resolved = this.resolve( address );

            if( !resolved ){
                // console.log( `Address ${ address } not resolved!` );
                request.end();
                return;
            }

            console.log( `REQUEST ${ request["id"]} TO ${ resolved.aioHost } RECEIVED-REQUEST`);
            let dataListen = data =>{
                requestData.push( data );
            }
            request.on("data", dataListen );




            request["connected"] = true;
            request.on("close", hadError => {
                request["connected"] = false;
                delete this.connections[request["id"]];
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

            let connect = ()=>{
                this.connect( request, {
                    server: resolved.identifier,
                    application: resolved.application,
                    dataListen: dataListen,
                    requestData: requestData,
                }, resolved );
            }

            this.openDemandedGetaway( resolved, request );
            connect();


        };
    }

    private openDemandedGetaway( resolved:Resolved, request:net.Socket ){
        let needGetAway = this.needGetAway[ resolved.identifier ][ resolved.application ];
        if( !needGetAway.hasRequest ) {
            console.log( `REQUEST ${ request["id"]} TO ${ resolved.aioHost }  REQUIRING GETAWAY`)
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


        if( resolved.getawayReleaseTimeout === "none" ) return;
        needGetAway.timeout = setTimeout( ()=>{
            needGetAway.hasRequest = false;
            Object.entries( this.getaway[resolved.identifier][resolved.application]).map( ([key, getAway]) => getAway )
                .filter( value => !value.connection["anchored"] && value.connection["connectionStatus"] === "connected")
                .forEach( (value, index, array) => {
                    console.log("PREPARED GETAWAY ABORTED!");
                    value.connection.destroy( new Error("ABORTEDGETAWAY"));
                });
        }, Number( resolved.getawayReleaseTimeout)  );
    }

    private directConnect( request:net.Socket, opts:ConnectionOptions ){
        let app = this.aio.apps.applications().find( value => value.name == opts.application );
        if( !app ) return request.end();
        let response = net.connect( {
            host: app.address,
            port: app.port
        });
        anchor( `${opts.application}.${ opts.server }`, "AGENT-CLIENT-DIRECT", request, response, opts.requestData, [ ]);
    }

    onAuth( auth:string ){
        this.authKey = auth;
    }


    private registerGetAway( opts:GetAwayOptions, connection:net.Socket ){
        let next = this.waitGetAway[opts.server][ opts.application ].shift();
        let id = `GET:${nanoid( 16 )}`;
        connection[ "id" ] = id;
        connection[ "application" ] = opts.application;
        connection[ "server" ] = opts.server;
        if( typeof next === "function" ) {
            next( {
                busy: true,
                connection: connection ,
                id,
                autoReconnect: opts.autoReconnect
            });
            return;
        }

        let getAway:GetAway = {
            id,
            connection,
            busy: false,
            autoReconnect: opts.autoReconnect
        };

        this.getaway[ opts.server ][ opts.application ][ id ] = getAway

        connection.on( "close", hadError => {
            delete this.getaway[ opts.server ][ opts.application ][ id ];
        });

        this.notify("getAwayRegister", getAway );
    }

    private onGetAway( server:string, application:string, resolved:Resolved, request:net.Socket, callback:( getAway:GetAway )=>void ){
        let next = Object.entries( this.getaway[server][application]).find( ([key, getAway], index) => {
            return !getAway.busy
                && !!getAway.connection["readyToAnchor"];
        });


        if( !!next ){
            console.log( `REQUEST ${ request["id"]} TO ${ resolved.aioHost }  IMMEDIATELY CONNECT`)
            let [ key, getAway ] = next;
            getAway.busy = true;
            delete this.getaway[ server ][ application ][ key ];
            callback( getAway );
            return;
        }
        console.log( `REQUEST ${ request["id"]} TO ${ resolved.aioHost } WAIT FOR GETAWAY`)
        this.waitGetAway[ server] [ application ].push( callback );



    }


    public openGetAway ( opts:GetAwayOptions, resolved:Resolved ){
        let hasRequest = this.needGetAway[ opts.server ][ opts.application ].hasRequest;
        if( resolved.getawayReleaseOnDiscover ) hasRequest = true;

        let id = nanoid(12);
        if(!this.aio.openedServes.includes( opts.server ) ) return;
        if(resolved.identifier === this.aio.identifier && this.opts.directConnection === "on" ) return;
        if(!hasRequest ) return;

        let connection = net.connect( {
            host: this.opts.serverHost,
            port: this.opts.requestPort
        });
        connection.on( "connect", () => {
            connection["connectionStatus"] = "connected";

            //MODO wait response SERVSER
            let redirect:AuthIO = {
                server: identifierOf( opts.server ),
                app: opts.application,
                authReferer: this.authKey,
                authId: connection["id"],
                origin: identifierOf( this.opts.identifier )
            }


            connection.write( JSON.stringify( redirect ) );
            connection.once( "data", ( data ) => {
                connection[ "readyToAnchor" ] = true;

                this.registerGetAway( opts, connection );
            });
        });

        connection.on("close", hadError => {
            connection["connectionStatus"] = "disconnected";
        });

        connection.on("error", err => {
            console.log( "request-to-anchor-error", err.message );
        });

        connection.on( "close", hadError => {
            if( !connection[ "anchored" ] && opts.autoReconnect ) {
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
        Object.entries( this.connections ).forEach( ([key, request], index) => {
            request.end();
        });
        Object.entries( this.appsConnections ).forEach( ([key, appConnection], index) => {
            let appName = appConnection["appName"];
            appConnection.end( ()=>{
                console.log( "application connection end", appName );
            });
        })
        this.anchor.close( err => {
            if( err ) console.log( "Error on end anchor server", err.message );
            else console.log( "Anchor server stop with success!" );
        });

    }

    closeApp( app:App ){
        Object.entries( this.appsConnections ).filter( ([id, appSocket], index) => {
            return appSocket["appName"] === app.name;
        }).map( ([id, appSocket]) => appSocket )
            .forEach( appSocket => {
                appSocket[ "appStatus" ] = "stopped";
                appSocket.end( () => {
                    console.log( "application connection end", appSocket[ "appName" ] );
                });
            })
    }

    openApplication (app:App ){
        let responseGetaway = net.connect( {
            host: this.opts.serverHost,
            port: this.opts.responsePort
        });

        responseGetaway[ "id" ] = `RET:${nanoid(32 )}`;
        responseGetaway[ "appName" ] = app.name;
        responseGetaway[ "appAddress" ] = app.address;
        responseGetaway[ "appPort" ] = app.port;
        responseGetaway[ "appStatus" ] = "started";

        this.appsConnections[ responseGetaway["id"] ] = responseGetaway;
        responseGetaway.on( "close", hadError => {
            delete this.appsConnections[ responseGetaway["id"] ];
        });

        responseGetaway.on( "connect", () => {
            // console.log( "ON CONNECT AGENT APP RESPONSE", app.name, this.opts.responsePort )
            let auth:AuthIO = {
                server: identifierOf( this.opts.identifier ),
                app: app.name,
                authReferer: this.authKey,
                authId: responseGetaway["id"],
                origin: identifierOf( this.opts.identifier )
            }
            responseGetaway.write(  JSON.stringify(auth));


            let datas = [];
            let listenData = data =>{
                datas.push( data );
            }
            responseGetaway.on( "data", listenData );
            responseGetaway.once( "data", busy => {
                try {
                    let appConnection = net.connect({
                        host: app.address,
                        port: app.port
                    });
                    appConnection["id"] = `RESP:${nanoid(16)}`;
                    appConnection.on( "connect", () => {
                        anchor( `${app.name}.${ this.aio.identifier }`, "AGENT-SERVER", responseGetaway, appConnection, datas, [] );
                        responseGetaway.off( "data", listenData );
                        responseGetaway["anchorPiped"] = true;
                        console.log( `new connection with ${ "any" } established for ${ app.name }` );
                    });
                    appConnection.on( "error", err => {
                        console.log("app-server-error", err.message );
                        if( !responseGetaway["anchorPiped"] ){
                            responseGetaway.end();
                        }
                    });
                    this.openApplication( app );
                } catch (e) {
                    responseGetaway.end();
                    console.error( e )
                }
            });
        });

        responseGetaway.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        responseGetaway.on("close", ( error) => {
            delete this.appsConnections[ responseGetaway["id"] ];
            if( !responseGetaway["anchored"] && this.status === "started" && responseGetaway["appStatus"] === "started" ){
                setTimeout(()=>{
                    this.openApplication( app );
                }, this.opts.restoreTimeout)
            }
        });
    }
}