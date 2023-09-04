import {AgentProxy,AgentProxyOptions} from "./agent-proxy";
import {TokenService} from "../services/token.service";
import {TokenOptions} from "../../aio/opts/opts-token";
import net from "net";
import {AuthAgent, AuthResult} from "../server/server-proxy";
import {BaseEventEmitter} from "kitres/src/core/util";
import {AioResolver} from "../dns/aio.resolve";
import {ApplicationAIO} from "../applications";
import {Defaults} from "../../aio/opts/opts";

export type AgentAioOptions = AgentProxyOptions& TokenOptions& {
    authPort:number
}

interface AgentAioListener {
    auth( auth:AuthResult )
    authFailed( code:string, message:string )
    isAlive( code:string, referer ),
    serverOpen( server:string ),
    serverClose( server:string )
}
export class AgentAio extends BaseEventEmitter<AgentAioListener> {
    private agentProxy:AgentProxy;
    private token:TokenService;
    private serverAuthConnection:net.Socket;
    public opts:AgentAioOptions;
    private result:"failed"|"authenticated"|"pendent" = "pendent";
    private status:"started"|"stopped" = "stopped";
    private agentDNS;
    public readonly aioResolve:AioResolver;
    public apps:ApplicationAIO;
    public authReferer:string;
    public authId:string;
    public openedServes:string[] = []


    constructor( opts:AgentAioOptions) {
        super();
        if( !opts.restoreTimeout ) opts.restoreTimeout = Defaults.restoreTimeout;
        this.opts = opts;
        this.token = new TokenService( opts );
        this.agentProxy = new AgentProxy( this, opts );
        this.aioResolve = new AioResolver( this.opts );
        this.apps = new ApplicationAIO( this );
        this.init();
    }

    get servers():string[]{
        let servers =  Object.entries( this.aioResolve.address ).map( ([key, server], index) => {
            return server.serverIdentifier
        });
        return [ ... new Set( servers )];
    }

    private createAuthConnection(){
        let connection = net.connect({
            port: this.opts.authPort,
            host: this.opts.serverHost
        });

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

        connection.on( "data", data => {
            let str = data.toString();
            console.log( str );
            let pack = JSON.parse( str );
            if( typeof pack.event === "string" ){
                let event = pack["event"];
                let args = pack["args"];
                if( !args ) args = [];
                // @ts-ignore
                this.notify( event, ...args );
            }
        });

        this.serverAuthConnection = connection;
    }

    private init(){
        this.apps.on("register", app => {
            if( this.status !== "started" )  return;
            if( this.result !== "authenticated" ) return;
            this.agentProxy.openApplication( app );
        });

        this.on("isAlive", ( code ) => {
            if( this.serverAuthConnection ) this.serverAuthConnection.write( JSON.stringify({
                event:"isAlive",
                args:[ code, this.authReferer ]
            }))
        });

        let openGetaways = ( availableServers:string[])=>{
            Object.entries( this.aioResolve.address ).filter( ([address, resolved]) => {
                return availableServers.includes( resolved.serverIdentifier );
            }).forEach( ([address, resolved], index) => {
                for (let i = 0; i < 10; i++) {
                    this.agentProxy.openGetAway( {
                        server: resolved.serverIdentifier,
                        application: resolved.application
                    })
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
            this.authReferer = auth.referer;
            this.authId = auth.id;
            this.openedServes = auth.availableServers;
            this.status = "started";
            this.agentProxy.onAuth( auth.referer );
            this.apps.applications().forEach( application => {
                console.log( "open-application", application.name, application.address, application.port )
                let releases =application.releases;
                if( !releases ) releases = Defaults.releases;
                for ( let i = 0 ; i< 3; i++ ){
                    this.agentProxy.openApplication( application )
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
        this.serverAuthConnection.end();
        this.agentProxy.stop();
        this.status = "stopped";
    }

    resolve( address: string ) {
        let app:string, server:string;
        return this.aioResolve.resolved( address );
    }
}