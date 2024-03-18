import {ResolverServer, AgentProxyOptions, Resolved, CloseGetawayOptions} from "./resolve";
import {TokenService} from "../services";
import {TokenOptions} from "../../aio/opts/opts-token";
import {BaseEventEmitter} from "kitres";
import {AioResolver} from "./resolve";
import {ApplicationAIO} from "./applications";
import {Defaults} from "../defaults";
import {AppServer} from "./applications";
import {
    AgentAuthenticate, AuthApplication,
    createListenableAnchorConnect,
    ListenableAnchorListener,
    ListenableAnchorSocket, ServerReleaseOptions
} from "../net";
import { AuthResult, AuthSocketListener} from "../net";
import {application} from "express";

export type AgentAioOptions = AgentProxyOptions& TokenOptions& {
    authPort:number
    getawayRelease: number,
    requestTimeout: number|"never",
    getawayReleaseOnDiscover: boolean,
    getawayReleaseTimeout: number|"never"
}


interface AgentAioListener extends AuthSocketListener {
    agentStart():void,
    agentStarted():void,
    agentStop():void
    authReady():void
    connectionLost( error?:Error ):void
}

export type AvailableApplication = {
    name:string,
    status: "online"|"offline",
    grants:string[]
}
export type AvailableServer = {
    server:string,
    status:"online"|"offline"
    grants:string[]
    apps:{
        [ app:string ]:AvailableApplication
    }
};

export class AgentAio extends BaseEventEmitter< ListenableAnchorListener<AgentAioListener> > {
    private readonly agentProxy:ResolverServer;
    private token:TokenService;
    private serverAuthConnection:ListenableAnchorSocket<{}, AgentAioListener>;
    public opts:AgentAioOptions;
    public appServer:AppServer;

    private result:"failed"|"authenticated"|"pendent" = "pendent";
    private _status:"started"|"stopped"|"staring" = "stopped";
    public readonly aioResolve:AioResolver;
    public apps:ApplicationAIO;
    public authId:string;
    private _lastTry:"error"|"connect";
    public remotesAvailable:{
        [p:string]:AvailableServer
    } = {}
    private _auth:AuthResult;


    constructor( opts:AgentAioOptions) {
        super();
        if( !opts.restoreTimeout ) opts.restoreTimeout = Defaults.restoreTimeout;
        this.opts = opts;
        this.token = new TokenService( opts );
        this.agentProxy = new ResolverServer( this, opts );
        this.aioResolve = new AioResolver( {
            etc: opts.etc,
            getawayRelease: opts.getawayRelease,
            requestTimeout: opts.requestTimeout,
            getawayReleaseOnDiscover: opts.getawayReleaseOnDiscover,
            getawayReleaseTimeout: opts.getawayReleaseTimeout,
        } );
        this.apps = new ApplicationAIO( this );
        this.appServer = new AppServer( this );
        this.init();
    }

    get identifier(){
        return this.opts.identifier;
    }

    get status(){
        return this._status;
    }

    get authReferer(){
        return this._auth?.referer;
    }


    get servers():string[]{
        let servers =  Object.entries( this.aioResolve.address ).map( ([key, server], index) => {
            return server.identifier
        }).filter( value => value !== this.identifier )
        return [ ... new Set( servers )];
    }

    remote( server:string, application?:string ){
        if( !this.remotesAvailable[ server ] ) {
            this.remotesAvailable[ server ] = {
                status: "offline",
                apps:{},
                grants:[],
                server
            }
        }
        let _application:(typeof this.remotesAvailable)[string]["apps"][string];
        let _server = this.remotesAvailable[ server ];
            if( application ){

            if( !_server.apps[ application ]) {
                _server.apps[ application ] = {
                    status: "offline",
                    grants:[],
                    name: application
                };
            }

            _application = _server.apps[ application ];
            if( _server.status === "offline" ) _application.status = "offline";
        }
        return { server:_server, application: _application }
    }

    isAioHostOnline(resolved:Resolved ){
        let status = this.remote( resolved.identifier, resolved.application );
        return  !!status
            && !!status.server
            && status.server.status === "online"
            && !!status.application
            && status.application.status === "online"
    }

    hasPermission(resolved:Resolved ){
        let status = this.remote( resolved.identifier, resolved.application );
        return !!status
            && !!status.server
            && !!status.application
            && status.application.grants.includes( this.identifier )
            && status.server.grants.includes( resolved.aioHost )
    }



    private createAuthConnection(){
        let _error:Error;
        let connection = createListenableAnchorConnect(  {
            port: this.opts.authPort,
            host: this.opts.serverHost,
            side: "client",
            method: "AUTH",
            attache: this.listener(),
            endpoint: "auth-client",
            allowHalfOpen: false,
            // noDelay
        } );

        this._auth = null;

        connection.on( "error", err => {
            console.log( "server-auth-connection-error", err.message );
            this._lastTry = "error";
            _error = err;
        });

        connection.on( "close", hadError => {
            console.log( "connection with server end!", {
                hadError,
                "this.status": this.status,
                "this.result": this.result,
            });

            this.appServer.closeAll();
            this.agentProxy.closeAll();
            if( (hadError && this.status !== "stopped" ) || ( this.result === "authenticated" && this.status === "started" )) setTimeout(()=>{
                this.createAuthConnection();
            }, Defaults.restoreTimeout );

            this.notify( "connectionLost", _error )
        });


        connection.once("connect", () => {
            // if ( this._lastTry === "error" ) {
            //     this.stop();
            //     setTimeout(()=>{
            //         this.start();
            //     }, 1000 * 3 );
            //     return;
            // }
            this._lastTry = "connect";
            let token = this.token.tokenOf( this.opts.identifier );
            console.log( token )
            let auth:AgentAuthenticate = {
                agent: this.opts.identifier,
                token: token.token.token,
                servers: this.servers,
                machine: this.machine(),
                referer:null,
                apps: this.authApp(),
                status: "online"
            }
            connection.send( "auth", auth );
        });

        this.serverAuthConnection = connection;
    }

    authApp(): AgentAuthenticate["apps"] {
        let apps:AgentAuthenticate["apps"] = {};
        this.apps.applications().forEach( value => {
            apps[ value.name ] = {
                name: value.name,
                grants: value.grants||[],
                status: this.appServer.statusOf( value ) === "started"? "online": "offline"
            }
        });
        return  apps;
    }



    private init(){
        this.on("authResult", auth => {
            console.log(`[aio:agent] Conexão estabelecida com o servidor, preparando para abrir as aplicações` ) ;
            console.log( "agent.authResult", auth );
            this.result = "authenticated";
            this._auth = auth;
            this.authId = auth.id;

            Object.values( auth.availableServers ).forEach( _serv => {
                let server = this.remote( _serv.server ).server;
                server.status = _serv.status;
                server.grants = _serv.grants;
                Object.values( _serv.apps ).forEach( _app => {
                    let app = this.remote( server.server, _app.name ).application;
                    app.status = _app.status;
                    app.grants = _app.grants
                })
            });

            if( this.opts.directConnection === "off" ){
                this.apps.applications().forEach( value => {
                    let local = this.remote( this.identifier, value.name );
                    local.server.status = "online";
                    local.application.status  = "online";
                    local.server.grants.push( `${ value.name }.${ this.identifier }`);
                    local.application.grants.push( this.identifier );
                })
            }

            this._status = "started";
            this.apps.applications().forEach( application => {
                console.log(`[aio:agent] Conexão estabelecida com o servidor, Lançando o servidor de ${ application.name }` ) ;
                this.appServer.releaseApplication( application );
            });

            this.notify("authReady" );
        });


        this.apps.on("sets", (app, old) => {
            console.log( `agent:app.on.sets application = "${app.name}" change = "${!!old}"`)
            if( this.status !== "started" )  return;
            if( this.result !== "authenticated" ) return;
            if( !!old ){
                this.appServer.closeApp( old ).then( value => {
                    this.appServer.releaseApplication( app );
                });
                return;
            }
            this.appServer.releaseApplication( app );
        });

        this.apps.on( "delete", app => {
            this.appServer.closeApp( app ).then( value => {
                console.log( "All socket closed!" );
            });
        });

        this.on("isAlive", ( code ) => {
            if( this.serverAuthConnection ) this.serverAuthConnection.send( "isAlive", code, this.authReferer )
        });

        this.on( "busy", busy => {
            this.appServer.bused( busy );
        });



        this.on( "authFailed", (code, message) => {
            this.result = "failed"
            console.log( code, message );
        });

        this.appServer.on("applicationReleased", app => {
            console.log( `agent:applicationReleased application ="${app.name}"` );
            let grants = new Set( app.grants||[ ] );
            grants.add( this.identifier );
            this.serverAuthConnection.send("applicationOnline", {
                server: this.identifier,
                application: app.name,
                grants: [...grants],
                protocol: app.protocol
            });
        });

        this.appServer.on( "applicationStopped", app => {
            console.log( `agent:applicationStopped application ="${application}"` );
            this.serverAuthConnection.send( "applicationOffline", {
                server: this.identifier,
                application: app.name,
                grants: app.grants,
                protocol: app.protocol
            });
        });

        this.on("remoteServerOnline", ( server) => {
            console.log( `agent:remoteServerOnline server = "${server}"` );
            let status = this.remote( server );
            status.server.status = "online";
        });

        let remoteApplicationOffline = ( opts:CloseGetawayOptions)=>{
            let status = this.remote( opts.server, opts.application );
            status.application.status = "offline";
            this.agentProxy.closeGetaway( opts );
        }

        this.on( "remoteServerOffline", server => {
            console.log( `agent:remoteServerOffline server = "${server}"` );
            let status = this.remote( server );
            status.server.status = "offline";
            Object.values( this.remotesAvailable[ server ].apps ).forEach( app => {
                remoteApplicationOffline( {
                    server: server,
                    application: app.name
                });
            });
        });

        this.on("applicationOnline", (opts) => {
            console.log( `agent:applicationOnline server = "${opts.server}" application = "${opts.application}"` );
            let status = this.remote( opts.server, opts.application );
            status.server.status = "online";
            status.application.status = "online";
            status.application.grants.push( this.identifier );
            status.server.grants.push( `${ opts.application }.${ opts.server }`);
        });

        this.on("applicationOffline", opts => {
            console.log( `agent:applicationOffline server = "${ opts.server }" application = "${ opts.application }"` );
            remoteApplicationOffline( opts );
        });


        this.on( "hasPendentRequest", pendentRequest => {
            let app = this.apps.getApplication( pendentRequest.application );
            if( !app ) return;
            this.appServer.restoreApplication( app );
        });

        this.init = ()=>{};
    }

    machine(){
        const machine = require( "node-machine-id" );
        return `${this.identifier }://${ machine.machineIdSync(true)}/${ machine.machineIdSync()}`;
    }

    start(){
        this._status = "staring";
        this.result = "pendent";
        this.createAuthConnection();
        this.once("authResult", auth => {
            console.log( `[aio:agent] Connectio with server estabelecida!`)
            this.agentProxy.start();
            this.notify("agentStarted" )
        });
        this.notify("agentStart" )
    }

    stop(){
        console.log( "stopping agent server... ", this.identifier )
        this._status = "stopped";
        if( this.serverAuthConnection ) this.serverAuthConnection.end();
        if( this.agentProxy ) this.agentProxy.stop();
        if( this.appServer ) this.appServer.stop();
        this.notify( "agentStop" );
    }
}