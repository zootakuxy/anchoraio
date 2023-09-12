import {AgentGetaway,AgentProxyOptions} from "./agent-getaway";
import {TokenService} from "../services/token.service";
import {TokenOptions} from "../../aio/opts/opts-token";
import net from "net";
import {BaseEventEmitter} from "kitres";
import {AioResolver} from "../dns/aio.resolve";
import {ApplicationAIO} from "./applications";
import {Defaults} from "../defaults";
import {AppServer} from "./applications/app-server";
import {asAnchorSocket, AnchorSocket} from "../net/anchor";
import {AuthAgent, AuthResult, AuthSocketListener} from "../net/auth";

export type AgentAioOptions = AgentProxyOptions& TokenOptions& {
    authPort:number
    getawayRelease: number,
    requestTimeout: number|"never",
    getawayReleaseOnDiscover: boolean,
    getawayReleaseTimeout: number|"never"

}


export class AgentAio extends BaseEventEmitter<AuthSocketListener> {
    private agentProxy:AgentGetaway;
    private token:TokenService;
    private serverAuthConnection:AnchorSocket<{}, AuthSocketListener>;
    public opts:AgentAioOptions;
    public appServer:AppServer;

    private result:"failed"|"authenticated"|"pendent" = "pendent";
    private _status:"started"|"stopped" = "stopped";
    public readonly aioResolve:AioResolver;
    public apps:ApplicationAIO;
    public authId:string;
    public openedServes:string[] = []
    private _auth:AuthResult;


    constructor( opts:AgentAioOptions) {
        super();
        if( !opts.restoreTimeout ) opts.restoreTimeout = Defaults.restoreTimeout;
        this.opts = opts;
        this.token = new TokenService( opts );
        this.agentProxy = new AgentGetaway( this, opts );
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
        let connection = asAnchorSocket( net.connect({
            port: this.opts.authPort,
            host: this.opts.serverHost
        }), {
            side: "client",
            method: "AUTH",
            attache: this.listener()
        } );

        this._auth = null;

        connection.on( "error", err => {
            console.log( "server-auth-connection-error", err.message );
        });

        connection.on( "close", hadError => {
            console.log( "connection with server end!")
            if( hadError || (this.result === "authenticated" && this.status === "started")) setTimeout(()=>{
                this.createAuthConnection();
            }, this.opts.restoreTimeout );
        });

        connection.once("connect", () => {
            let token = this.token.tokenOf( this.opts.identifier );
            let auth:AuthAgent = {
                agent: this.opts.identifier,
                token: token.token.token,
                servers: this.servers
            }
            connection.write(JSON.stringify( auth ));
        });

        // connection.on( "data", data => {
        //     let str = data.toString();
        //     console.log( str );
        //     let pack = JSON.parse( str );
        //     if( typeof pack.event === "string" ){
        //         let event = pack[ "event" ];
        //         let args = pack["args"];
        //         if( !args ) args = [];
        //         // @ts-ignore
        //         this.notify( event, ...args );
        //     }
        // });

        this.serverAuthConnection = connection;
    }

    private init(){
        this.apps.on("register", app => {
            if( this.status !== "started" )  return;
            if( this.result !== "authenticated" ) return;
            this.appServer.openApplication( app );
        });

        this.on("isAlive", ( code ) => {
            if( this.serverAuthConnection ) this.serverAuthConnection.write( JSON.stringify({
                event:"isAlive",
                args:[ code, this.authReferer ]
            }))
        });

        let openGetaways = ( availableServers:string[])=>{
            Object.entries( this.aioResolve.address ).filter( ([address, resolved]) => {
                return availableServers.includes( resolved.identifier );
            }).forEach( ([address, resolved], index) => {
                // if( !resolved.getawayReleaseOnDiscover ) return;
                for (let i = 0; i < resolved.getawayRelease; i++) {
                    this.agentProxy.openGetAway( {
                        server: resolved.identifier,
                        application: resolved.application,
                        autoReconnect: true
                    }, resolved )
                }
            });
        }


        this.on("serverOpen", server => {
            console.log( "ServerOpen", server );
            this.openedServes.push( server );
            openGetaways( [ server ] );
        });

        this.on( "serverClose", server => {
            console.log( "serverClose", server );
            let index = this.openedServes.indexOf( server );
            if( index === -1 ) return;
            this.openedServes.splice( index, 1 );
        });

        this.on("auth", auth => {
            this.result = "authenticated";
            this._auth = auth;
            this.authId = auth.id;
            this.openedServes = auth.availableServers;
            if( this.opts.directConnection === "off" ) this.openedServes.push( this.identifier );
            this._status = "started";
            this.apps.applications().forEach( application => {
                console.log( "open-application", application.name, application.address, application.port )
                let releases =application.releases;
                if( !releases ) releases = Defaults.serverRelease||1;
                for ( let i = 0 ; i< releases; i++ ){
                    this.appServer.openApplication( application )
                }
            });
            openGetaways( this.openedServes );
        });

        this.on( "authFailed", (code, message) => {
            this.result = "failed"
            console.log( code, message );
        });

        this.init = ()=>{};
    }

    start(){
        this.result = "pendent";
        this.createAuthConnection();
        this.once("auth", auth => {
            this.agentProxy.start();
        })

    }

    stop(){
        this._status = "stopped";
        this.serverAuthConnection.end();
        this.agentProxy.stop();
        this.appServer.stop();
    }
}