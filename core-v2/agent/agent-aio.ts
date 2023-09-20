import {ResolverServer,AgentProxyOptions} from "./resolve/resolver-server";
import {TokenService} from "../services";
import {TokenOptions} from "../../aio/opts/opts-token";
import {BaseEventEmitter} from "kitres";
import {AioResolver} from "./resolve";
import {ApplicationAIO} from "./applications";
import {Defaults} from "../defaults";
import {AppServer} from "./applications";
import {createListenableAnchorConnect, ListenableAnchorListener, ListenableAnchorSocket} from "../net";
import {AuthAgent, AuthResult, AuthSocketListener} from "../net";

export type AgentAioOptions = AgentProxyOptions& TokenOptions& {
    authPort:number
    getawayRelease: number,
    requestTimeout: number|"never",
    getawayReleaseOnDiscover: boolean,
    getawayReleaseTimeout: number|"never"
}


interface AgentAioListener extends AuthSocketListener {
    agentStart(),
    agentStarted(),
    agentStop()
}

export type AvailableServer = {
    server:string,
    apps:Set<string>
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
    public availableRemoteServers:AvailableServer[] = []
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

    private createAuthConnection(){
        let connection = createListenableAnchorConnect(  {
            port: this.opts.authPort,
            host: this.opts.serverHost,
            side: "client",
            method: "AUTH",
            attache: this.listener()
        } );

        this._auth = null;

        connection.on( "error", err => {
            console.log( "server-auth-connection-error", err.message );
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
            }, this.opts.restoreTimeout );
        });


        connection.once("connect", () => {
            let token = this.token.tokenOf( this.opts.identifier );
            let auth:AuthAgent = {
                agent: this.opts.identifier,
                token: token.token.token,
                servers: this.servers,
                machine: this.machine()
            }
            connection.send( "auth", auth );
        });

        this.serverAuthConnection = connection;
    }

    private init(){
        this.apps.on("sets", (app, old) => {
            if( this.status !== "started" )  return;
            if( this.result !== "authenticated" ) return;
            if( !!old ){
                this.appServer.closeApp( old.name ).then( value => {
                    this.appServer.releaseApplication( app );
                })
            }
        });

        this.apps.on( "delete", app => {
            this.appServer.closeApp( app.name ).then( value => {
                console.log( "All socket closed!" );
            });
        });

        this.on("isAlive", ( code ) => {
            if( this.serverAuthConnection ) this.serverAuthConnection.send( "isAlive", code, this.authReferer )
        });


        this.on("remoteServerOpen", server => {
            console.log( "ServerOpen", server );
            if( this.availableRemoteServers.find( value => value.server === server )){
                this.availableRemoteServers.push( {
                    server: server,
                    apps: new Set( )
                });
            }
        });

        this.on( "remoteServerClosed", server => {
            console.log( "serverClose", server );
            let index = this.availableRemoteServers.findIndex( value => value.server === server );
            if( index === -1 ) return;
            this.availableRemoteServers.splice( index, 1 );
        });

        this.on("authResult", auth => {
            this.result = "authenticated";
            this._auth = auth;
            this.authId = auth.id;
            this.availableRemoteServers = [];
            auth.availableServers.forEach( value => {
                this.availableRemoteServers.push({
                    server: value,
                    apps: new Set()
                })
            });

            if( this.opts.directConnection === "off" ) this.availableRemoteServers.push({
                server: this.identifier,
                apps: new Set( this.apps.applications().map( value => value.name ) )
            });

            this._status = "started";
            this.apps.applications().forEach( application => {
               this.appServer.releaseApplication( application );
            });
        });

        this.on( "authFailed", (code, message) => {
            this.result = "failed"
            console.log( code, message );
        });

        this.appServer.on("onAppRelease", app => {
            console.log( "agent:onAppRelease", app );
            let grants = new Set( app.grants||[ ] );
            grants.add( this.identifier );
            this.serverAuthConnection.send("appServerRelease", {
                server: this.identifier,
                application: app.name,
                grants: [...grants]
            } );
        });

        this.appServer.on( "onAppClosed", application => {
            console.log( "agent:onAppClosed", application );
            this.serverAuthConnection.send( "appServerClosed", {
                server: this.identifier,
                application: application,
                grants: []
            });
        });

        this.on("appServerRelease", (opts) => {
            let remote = this.availableRemoteServers.find( value => value.server === opts.server );
            if( !remote ) this.availableRemoteServers.push( remote = {
                server: opts.server,
                apps: new Set()
            });
            remote.apps.add( opts.application );
            console.log( this.availableRemoteServers );
        });

        this.on("appServerClosed", opts => {
            let remote = this.availableRemoteServers.find( value => value.server );
            if( !remote ) this.availableRemoteServers.push( remote = {
                server: opts.server,
                apps: new Set()
            });
            console.log( "agent:appServerClosed", opts )
            remote.apps.delete( opts.application );
            this.agentProxy.closeGetaway( opts );
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