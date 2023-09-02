import net from "net";
import {AuthIO, identifierOf} from "../server/server-proxy";
import {nanoid} from "nanoid";
import {AgentAio} from "./agent-aio";
import {App} from "../applications";
import {identifier} from "kitres";

export type AgentProxyOptions = {
    requestPort:number,
    responsePort:number,
    serverHost:string,
    anchorPort:number,
    identifier:string,
    restoreTimeout: number
}


type ConnectionOptions =  {
    serverHost:string,
    serverRequestPort:number,
    server:string,
    app:string,
    requestData:any[],
    dataListen:( data )=>void
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

    private status:"started"|"stopped" = "stopped";
    private aio: AgentAio;

    constructor( aio:AgentAio, opts: AgentProxyOptions) {
        this.aio = aio;
        if( !opts.restoreTimeout ) opts.restoreTimeout = 1500;
        this.opts = opts;
        this.anchor = new net.Server();
        this.connections = {};
        this.appsConnections = {};
        this.listen();
    }

    resolve( address:string ){
        return this.aio.resolve( address );
    }

    private listen(){
        this._connectionListener = request => {
            request["id"] = nanoid( 16 );
            this.connections[ request["id"] ] = request;
            const remoteAddressParts = request.address()["address"].split( ":" );
            const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
            console.log( "NEW REQUEST ON AGENT IN ADDRESS", address );

            let resolved = this.resolve( address );

            if( !resolved ){
                console.log( `Address ${ address } not resolved!` );
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

            this.connect( request, {
                server: identifierOf( resolved.server ),
                app: resolved.application,
                dataListen: dataListen,
                requestData: requestData,
                serverHost: this.opts.serverHost,
                serverRequestPort: this.opts.requestPort
            });
        };
    }

    onAuth( auth:string ){
        this.authKey = auth;
    }

    private connect ( request, opts:ConnectionOptions ){
        let   requestToAnchor = net.connect( {
            host: opts.serverHost,
            port: opts.serverRequestPort
        });

        requestToAnchor.on( "connect", () => {

            //MODO wait response SERVSER
            console.log( "CONNECTED TO REDIRECT ON AGENT", opts.serverRequestPort )
            let redirect:AuthIO = {
                server: identifierOf( opts.server ),
                app: opts.app,
                authReferer: this.authKey,
                agent: identifierOf( this.opts.identifier )
            }
            requestToAnchor.write( JSON.stringify( redirect ) );

            requestToAnchor.on( "close", hadError => {
                if( !requestToAnchor["anchored"] && request["connected"]) {
                    setTimeout ( ()=>{
                        this.connect( request, opts );
                    }, 1500 );
                }
            });

            requestToAnchor.on("error", err => {
                console.log( "request-to-anchor-error", err.message );
            });

            requestToAnchor.once( "data", ( data ) => {
                console.log( "AN AGENT REDIRECT READY")
                while ( opts.requestData.length ){
                    let aData = opts.requestData.shift();
                    requestToAnchor.write( aData );
                }
                requestToAnchor.pipe( request );
                request.pipe( requestToAnchor );
                request.off( "data", opts.dataListen );
                requestToAnchor["anchored"] = true;
                request["anchored"] = true;
            });


            // // MODO noWait response server
            // console.log( "AN AGENT REDIRECT READY")
            // while ( opts.requestData.length ){
            //     let aData = opts.requestData.shift();
            //     requestToAnchor.write( aData );
            // }
            // requestToAnchor.pipe( request );
            // request.pipe( requestToAnchor );
            // request.off( "data", opts.dataListen );
            // requestToAnchor["anchored"] = true;
            // request["anchored"] = true;
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
        let request = net.connect( {
            host: this.opts.serverHost,
            port: this.opts.responsePort
        });

        request[ "id" ] = nanoid(32 );
        request[ "appName" ] = app.name;
        request[ "appAddress" ] = app.address;
        request[ "appPort" ] = app.port;
        request[ "appStatus" ] = "started";

        this.appsConnections[ request["id"] ] = request;

        request.on( "connect", () => {
            console.log( "ON CONNECT AGENT APP RESPONSE", app.name, this.opts.responsePort )
            let auth:AuthIO = {
                server: identifierOf( this.opts.identifier ),
                app: app.name,
                authReferer: this.authKey,
                agent: identifierOf( this.opts.identifier )
            }
            request.write(  JSON.stringify(auth), err => {
                console.log( "ON WRITED!" );
            });
            let datas = [];
            let listenData = data =>{
                datas.push( data );
            }

            request.on( "data", listenData );
            request.once( "data", data => {
                console.log( "ON REQUEST READY ON AGENT SERVER")
                let appConnection = net.connect({
                    host: app.address,
                    port: app.port
                });
                appConnection.on( "connect", () => {
                    while ( datas.length ){
                        appConnection.write(  datas.shift() );
                    }
                    appConnection.pipe( request );
                    request.pipe( appConnection );
                    request.off( "data", listenData );
                });
                appConnection.on( "error", err => {
                    console.log("app-server-error", err.message )
                });
                this.openApplication( app );
                request["anchored"] = true;
            });
        });

        request.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        request.on("close", ( error) => {
            delete this.appsConnections[ request["id"] ];
            if( error && !request["anchored"] && this.status === "started" && request["appStatus"] === "started" ){
                setTimeout(()=>{
                    this.openApplication( app );
                }, this.opts.restoreTimeout)
            }
        });
    }
}




