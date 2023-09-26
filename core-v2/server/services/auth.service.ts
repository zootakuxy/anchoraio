import {ServerAio} from "../server-aio";
import {createServer, Server } from "net";
import {asListenableAnchorConnect, AuthAgent, AuthSocketListener, ServerReleaseOptions} from "../../net";
import {nanoid} from "nanoid";
import {BaseEventEmitter} from "kitres/src/core/util";

export type App = {
    name:string,
    grants:string[]
}

export type AgentAuthenticate = {
    id:string,
    referer:string,
    agent:string,
    apps:{
        [application:string]:App
    }
    machine:string
    servers:string[],
}


interface AuthServiceEvent extends AuthSocketListener {
    dined( code:string, message:string, auth:AuthAgent),
    error( error:Error, event:keyof AuthSocketListener|"dined")
}

export class AuthService extends BaseEventEmitter<AuthServiceEvent>{
    private saio:ServerAio;
    private serverAuth:Server;
    constructor( saio:ServerAio ) {
        super();
        this.saio = saio;
        this.__init();
    }

    private __init(){
        this.serverAuth = createServer( _ns => {
            let socket = asListenableAnchorConnect<any, AuthSocketListener>( _ns, {
                side: "server",
                method: "AUTH",
                endpoint: "auth-server",
            });

            socket.eventListener().once( "auth", auth => {
                console.log( "auth", auth );
                let end = ( code?:string, message?:string )=>{
                    socket.write( JSON.stringify({
                        event:"authFailed",
                        args:[ code, message ]
                    }))
                    socket.end();
                    this.notifySafe( "dined", code, message, auth )
                        .forEach( value => {
                            if( value.error ) this.notify("error", value.error, "dined" );
                        })
                    return;
                }

                if( !auth || !auth.agent || !auth.token || !auth.machine ) return end( "1010", "Missing auth props");
                let token = this.saio.tokenService.tokenOf( auth.agent );
                if( !token ) return end( "1011", "Token not found" );
                if( !token.token ) return end( "Token invalid" );
                if( token.token.token !== auth.token ) return  end( "1012","Invalid token math" );
                if( token.token.status !== "active" ) return end("1013",`Invalid token status ${ token.token.status }`);
                if( !token.token.machine ){
                    token = this.saio.tokenService.link( auth.agent, auth.machine )
                }
                if( token.token.machine !== auth.machine ) return end( "1014", "Token viculado com outro servidor" );

                let register = ()=>{
                    let referer = `${nanoid(16 )}`;
                    socket[ "referer" ] = referer;
                    socket[ "agentServer" ] = auth.agent;
                    if( !auth.servers ) auth.servers = [];

                    let agentAuthenticate: AgentAuthenticate = {
                        id: socket.id(),
                        referer: referer,
                        agent: auth.agent,
                        servers: auth.servers,
                        machine: auth.machine,
                        apps:{}
                    };
                    socket.props( agentAuthenticate );
                    this.saio.agents[ auth.agent ]  = Object.assign( agentAuthenticate, {
                        connection: socket,
                    });

                    let servers = Object.keys( this.saio.agents ).filter( value => auth.servers.includes( value ));
                    // let authResponse:AuthResult = ;

                    socket.send("authResult", {
                        id: socket.id(),
                        referer: referer,
                        availableServers: servers
                    } );

                    Object.entries( this.saio.agents ).forEach( ([ keyId, agent], index) => {
                        if( agent.agent === auth.agent ) return;
                        if( !agent.servers.includes( auth.agent ) ) return;
                        let apps = [ ];
                        if( apps.length ) agent.connection.send("remoteServerOpen", auth.agent );
                        this.notifySafe( "remoteServerOpen", auth.agent )
                            .forEach( value => {
                                if( value.error ) this.notifySafe( "error", value.error, "remoteServerOpen" );
                            });
                    });

                    socket.on( "close", hadError => {
                        Object.entries( this.saio.agents ).forEach( ([ keyId, agent], index) => {
                            if( agent.agent === auth.agent ) return;
                            if( !agent.servers.includes( auth.agent ) ) return;
                            agent.connection.send( "remoteServerClosed", auth.agent );
                            this.notifySafe( "remoteServerClosed", auth.agent )
                                .forEach( value => {
                                    if( value.error ) this.notifySafe( "error", value.error, "remoteServerClosed" );
                                });

                        });
                    });
                    this.notifySafe( "auth", auth )
                        .forEach( value => {
                            if( value.error ) this.notifySafe("error", value.error, "auth" )
                        })
                }

                let current = this.saio.agents[ auth.agent ];
                if( !current ) return register();
                if( current.connection["closed"] ) return register();
                if( current.connection.status() !== "connected" ) return register();

                //Check if is alive
                let checkAliveCode = nanoid(32 );

                let timeoutCheck = ()=>{
                    current.connection.eventListener().onceOff( "isAlive", listenResponse );
                    try { current.connection.destroy( new Error( "zombie socket" ) );
                    } catch (e){ }
                    register();
                }

                let timeoutCode = setTimeout(()=>{
                    timeoutCheck();
                }, 10000 );

                let listenResponse;

                current.connection.eventListener().once( "isAlive", listenResponse = (code, referer) => {
                    if( code === checkAliveCode && referer === current.referer ){
                        timeoutCheck = ()=>{};
                        clearTimeout( timeoutCode );
                        return end( "1014","Another agent instance is connected!" );
                    }
                });

                current.connection.send( "isAlive", checkAliveCode, null );
            });

            socket.eventListener().on( "appServerRelease", (opts) => {
                let auth = socket.props();
                let notify = [];
                Object.entries( this.saio.agents ).forEach( ([ keyId, agent], index) => {
                    if( agent.agent === auth.agent ) return;
                    if( !agent.servers.includes( auth.agent ) ) return;
                    let grants = opts.grants.includes( "*" ) || opts.grants.includes( agent.agent )
                    if( !grants ) return;
                    notify.push( agent.agent );
                    agent.connection.send( "appServerRelease", {
                        application: opts.application,
                        grants: opts.grants,
                        server: auth.agent
                    } );
                });
                this.notifySafe( "appServerRelease", opts )
                    .forEach( value => {
                        if( value.error ) this.notifySafe( "error", value.error, "appServerRelease" );
                    })
            });

            socket.eventListener().on( "appServerClosed", ( opts) => {
                let auth = socket.props();
                Object.entries( this.saio.agents ).forEach( ([ keyId, agent], index) => {
                    if( agent.agent === auth.agent ) return;
                    if( !agent.servers.includes( auth.agent ) ) return;
                    let releaseOptions:ServerReleaseOptions = {
                        grants: opts.grants,
                        server: auth.agent,
                        application: opts.application
                    };

                    agent.connection.send( "appServerClosed", releaseOptions );
                });

                this.notifySafe( "appServerClosed", opts )
                    .forEach( value => {
                        if( value.error ) this.notifySafe( "error", value.error, "appServerClosed" );
                    })
            });

            socket.on( "close", () => {
                let agentServer = socket[ "agentServer" ];
                let agent = this.saio.agents[ agentServer ];
                if( !agent ) return;
                if( agent.connection.id() === socket.id() ) delete this.saio.agents[ agentServer ]
            });

            socket.on( "error", err => {
                console.log( "server-auth-error", err.message )
            });
        });
    }

    listen( port:number ){
        this.serverAuth.listen( port );
    }
}