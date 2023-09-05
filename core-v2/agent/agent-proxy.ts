import net from "net";
import {anchor, AuthIO, ConnectionBusy, identifierOf} from "../server/server-proxy";
import {nanoid} from "nanoid";
import {AgentAio} from "./agent-aio";
import {App} from "../applications";
import {Defaults} from "../../aio/opts/opts";
import {Resolved} from "../dns/aio.resolve";

export type AgentProxyOptions = {
    requestPort:number,
    responsePort:number,
    serverHost:string,
    anchorPort:number,
    identifier:string,
    restoreTimeout: number
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
}

type GetAwayOptions = {
    server:string,
    application:string
}

type NeedGetAway = {
    hasRequest:boolean,
    timeout
}


export class AgentProxy {
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

    private readonly getAways:{
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
        this.aio = aio;
        if( !opts.restoreTimeout ) opts.restoreTimeout = Defaults.restoreTimeout;
        this.opts = opts;
        this.anchor = new net.Server();
        this.connections = {};
        this.appsConnections = {};

        this.getAways = new Proxy({},{
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
            request["id"] = nanoid( 16 );
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



            request["connected"] = true;
            request.on("close", hadError => {
                request["connected"] = false;
                delete this.connections[request["id"]];
            })

            //get server and app by address
            let requestData = [];
            let dataListen = data =>{
                requestData.push( data );
            }
            request.on("data", dataListen );

            request.on( "error", err => {
                console.log( "request-error", err.message );
            });

            if( resolved.identifier === this.aio.identifier ){
                return this.directConnect( request, {
                    server: this.aio.identifier,
                    application: resolved.application,
                    dataListen:dataListen,
                    requestData: requestData
                })
            }

            this.connect( request, {
                server: identifierOf( resolved.server ),
                application: resolved.application,
                dataListen: dataListen,
                requestData: requestData,
            }, resolved );
        };
    }

    private directConnect( request:net.Socket, opts:ConnectionOptions ){
        let app = this.aio.apps.applications().find( value => value.name == opts.application );
        if( !app ) return request.end();
        let response = net.connect( {
            host: app.address,
            port: app.port
        });
        anchor( request, response, opts.requestData, [ ]);
    }

    onAuth( auth:string ){
        this.authKey = auth;
    }


    private registerGetAway( opts:GetAwayOptions, connection:net.Socket ){
        let next = this.waitGetAway[opts.server][ opts.application ].shift();
        let id = nanoid( 16 );
        connection[ id ] = id;
        connection[ "application" ] = opts.application;
        connection[ "server" ] = opts.server;
        if( typeof next === "function" ) {
            next( {
                busy: true,
                connection: connection ,
                id
            });
            return;
        }

        this.getAways[ opts.server ][ opts.application ][ id ] = {
            id,
            connection,
            busy: false
        }

        connection.on( "close", hadError => {
            delete this.getAways[ opts.server ][ opts.application ][ id ];
        });
        console.log( `A connection for ${opts.application}.${opts.server} is ready for use` );
    }

    private onGetAway( server:string, application:string, resolved:Resolved, callback:( getAway:GetAway )=>void ){
        let next = Object.entries( this.getAways[server][application]).find( ([key, getAway], index) => {
            return !getAway.busy
                && !!getAway.connection["readyToAnchor"];

        });


        if( !!next ){
            console.log( `Getaway for ${ application }.${ server } found readyToAnchor` );
            let [ key, getAway ] = next;
            getAway.busy = true;
            delete this.getAways[ server ][ application ][ key ];
            callback( getAway );
            return;
        }
        this.waitGetAway[ server] [ application ].push( callback );
        let needGetAway = this.needGetAway[ server ][ application ];
        if( needGetAway.timeout ){
            clearTimeout( needGetAway.timeout );
        }

        if( !needGetAway.hasRequest ) {
            needGetAway.hasRequest = true;
            for (let i = 0; i < resolved.getawayRelease; i++) {
                this.openGetAway( { server, application }, resolved )
            }
        }

        if( resolved.getawayReleaseTimeout === "none" ) return;
        needGetAway.timeout = setTimeout( ()=>{
            needGetAway.hasRequest = false;
        }, resolved.getawayReleaseTimeout  );

    }


    public openGetAway ( opts:GetAwayOptions, resolved:Resolved ){
        if(!this.aio.openedServes.includes( opts.server ) ) return;
        if( opts.server === this.aio.identifier ) return;
        if( !this.needGetAway[ opts.server ][ opts.application ].hasRequest ) return;

        let connection = net.connect( {
            host: this.opts.serverHost,
            port: this.opts.requestPort
        });
        connection.on( "connect", () => {
            //MODO wait response SERVSER
            // console.log( "CONNECTED TO REDIRECT ON AGENT", this.opts.requestPort )
            let redirect:AuthIO = {
                server: identifierOf( opts.server ),
                app: opts.application,
                authReferer: this.authKey,
                origin: identifierOf( this.opts.identifier )
            }

            connection.write( JSON.stringify( redirect ) );
            connection.once( "data", ( data ) => {
                connection[ "readyToAnchor" ] = true;
                // console.log( "AN AGENT REDIRECT READY" );

                this.registerGetAway( opts, connection );
            });

            if( resolved.getawayReleaseTimeoutBreak === "none" ) return;
            setTimeout( ()=>{
                if( !connection["anchored"] ){
                    connection.end();
                }
            }, resolved.getawayReleaseTimeoutBreak  );
        });

        connection.on("error", err => {
            console.log( "request-to-anchor-error", err.message );
        });

        connection.on( "close", hadError => {
            if( !connection[ "anchored" ]) {
                console.log( "Need getAway for ", opts.server, opts.application )
                setTimeout ( ()=>{
                    this.openGetAway( opts, resolved );
                }, this.opts.restoreTimeout  );
            }
        });
    }

    private connect ( request, opts:ConnectionOptions, resolved:Resolved ){
        this.onGetAway( opts.server, opts.application,  resolved, getAway => {
            // console.log( "AN AGENT REDIRECT READY")
            anchor( request, getAway.connection, opts.requestData, []);
            request.off( "data", opts.dataListen );
            this.openGetAway( {
                server: opts.server,
                application: opts.application
            }, resolved );
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
        let response = net.connect( {
            host: this.opts.serverHost,
            port: this.opts.responsePort
        });

        response[ "id" ] = nanoid(32 );
        response[ "appName" ] = app.name;
        response[ "appAddress" ] = app.address;
        response[ "appPort" ] = app.port;
        response[ "appStatus" ] = "started";

        this.appsConnections[ response["id"] ] = response;
        response.on( "close", hadError => {
            delete this.appsConnections[ response["id"] ];
        });

        response.on( "connect", () => {
            // console.log( "ON CONNECT AGENT APP RESPONSE", app.name, this.opts.responsePort )
            let auth:AuthIO = {
                server: identifierOf( this.opts.identifier ),
                app: app.name,
                authReferer: this.authKey,
                origin: identifierOf( this.opts.identifier )
            }
            response.write(  JSON.stringify(auth), err => {
                // console.log( "ON WRITED!" );
            });

            response.once( "data", busy => {
                try {
                    let str = busy.toString();
                    let connectionBusy:ConnectionBusy = JSON.parse( str );
                    let datas = [];
                    let listenData = data =>{
                        datas.push( data );
                    }
                    response.on( "data", listenData );
                    response.once( "data", () => {
                        let appConnection = net.connect({
                            host: app.address,
                            port: app.port
                        });
                        appConnection.on( "connect", () => {
                            anchor( response, appConnection, datas, [] );
                            response.off( "data", listenData );
                            response["anchorPiped"] = true;
                            console.log( `new connection with ${ connectionBusy.client } established for ${ app.name }` );
                        });
                        appConnection.on( "error", err => {
                            console.log("app-server-error", err.message );
                            if( !response["anchorPiped"] ){
                                response.end();
                            }
                        });
                    });
                    // console.log( "ON REQUEST READY ON AGENT SERVER")
                    console.log( `busy ${ app.name } established with ${connectionBusy.client}` );
                    this.openApplication( app );
                } catch (e) {
                    response.end();
                    console.error( e )
                }
            });
        });

        response.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        response.on("close", ( error) => {
            delete this.appsConnections[ response["id"] ];
            if( error && !response["anchored"] && this.status === "started" && response["appStatus"] === "started" ){
                setTimeout(()=>{
                    this.openApplication( app );
                }, this.opts.restoreTimeout)
            }
        });
    }
}