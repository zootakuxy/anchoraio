import {ServerAio} from "../server-aio";
import {createServer, Server } from "net";
import {
    AgentAuthenticate,
    asListenableAnchorConnect, AuthApplication,
    AuthSocketListener,
    ServerReleaseOptions
} from "../../net";
import {nanoid} from "nanoid";
import {BaseEventEmitter} from "kitres/src/core/util";
import {AvailableServer} from "../../agent";




interface AuthServiceEvent extends AuthSocketListener {
    dined( code:string, message:string, auth:AgentAuthenticate),
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
            let socket = asListenableAnchorConnect< AgentAuthenticate, AuthSocketListener>( _ns, {
                side: "server",
                method: "AUTH",
                endpoint: "auth-server",
            });

            socket.eventListener().once( "auth", auth => {
                let end = ( code?:string, message?:string )=>{
                    console.log( `server.agent:auth agent = "${auth.agent}" REJECTED | code = "${code} message = "${message}"` );
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
                    console.log( `` );
                    console.log( "====================== [NEW AGENT AUTHENTICATION] =========================");
                    console.log( `ID:           ${socket.id()}`);
                    console.log( `AGENT:        ${auth.agent}`);
                    console.log( `APPLICATIONS: ${Object.keys( auth.apps).join(", ")}`);
                    console.log( `SERVER:       ${auth.servers.join(", ")}`);
                    console.log( `STATUS:       ${auth.status}`);
                    console.log( "==========================================================================");

                    let referer = `${nanoid(16 )}`;
                    socket[ "referer" ] = referer;
                    socket[ "agentServer" ] = auth.agent;
                    if( !auth.servers ) auth.servers = [];

                    auth.id = socket.id();
                    auth.referer =  referer;
                    socket.props( auth );

                    this.saio.agents[ auth.agent ]  = Object.assign( auth, {
                        connection: socket,
                    });

                    let servers:{
                        [ server:string ]: AvailableServer
                    } = {};
                    Object.keys( this.saio.agents ).filter( value => auth.servers.includes( value ))
                        .forEach( serverName => {
                            let online: AvailableServer["apps"] = {};
                            let grants = new Set<string>();
                            Object.values( this.saio.agents[serverName].apps )
                                .forEach( value => {
                                    if( !(value.grants.includes("*") || value.grants.includes(auth.agent)) ) return;
                                    online[ value.name ] = {
                                        name: value.name,
                                        grants: new Set<string>([ auth.agent ]),
                                        status: value.status
                                    }
                                    grants.add( `${ value.name }.${ auth.agent }` );
                                });

                            servers[ serverName ] = {
                                server: serverName,
                                apps: online,
                                grants: grants,
                                status: this.saio.agents[serverName].status
                            };
                        });

                    socket.send("authResult", {
                        id: socket.id(),
                        referer: referer,
                        availableServers: servers
                    } );

                    this.saio.clientsOf( { server: auth.agent }).forEach( client => {
                        client.send( "remoteServerOnline", auth.agent );
                        this.notifySafe( "remoteServerOnline", auth.agent )
                            .forEach( value => {
                                if( value.error ) this.notifySafe( "error", value.error, "remoteServerOnline" );
                            });
                    });

                    socket.on( "close", hadError => {
                        this.saio.clientsOf( { server: auth.agent }).forEach( client => {
                            client.send( "remoteServerOffline", auth.agent );
                            this.notifySafe( "remoteServerOffline", auth.agent )
                                .forEach( value => {
                                    if( value.error ) this.notifySafe( "error", value.error, "remoteServerOffline" );
                                });
                        });
                        delete this.saio.agents[ auth.agent ];
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


            socket.eventListener().on( "applicationOnline", (opts) => {
                console.log( `server.applicationOnline server = "${opts.server}" application = "${opts.application}"` );

                let notify = [];
                let auth = socket.props();
                let app = auth.apps[ opts.application ];
                if( !app ){
                    app = {
                        status: "online",
                        grants: [...new Set<string>(opts.grants)],
                        name: opts.application
                    }
                    auth.apps[ opts.application ] = app;
                }

                app.grants = [...new Set<string>(opts.grants)];
                app.status = "online";

                this.saio.clientsOf({  server: auth.agent, application: opts.application})
                    .forEach( client => {
                        client.send( "applicationOnline", {
                            application: opts.application,
                            grants: [ client.props().agent ],
                            server: auth.agent
                        });
                        notify.push( client.props() );
                    });

                this.notifySafe( "applicationOnline", opts )
                    .forEach( value => {
                        if( value.error ) this.notifySafe( "error", value.error, "applicationOnline" );
                    })
            });

            socket.eventListener().on( "applicationOffline", (opts) => {
                console.log( `server.applicationOffline server = "${opts.server}" application = "${opts.application}"`)
                let auth = socket.props();
                let app = auth.apps[ opts.application ];
                if( !app ){
                    app = {
                        status: "offline",
                        grants: [...new Set<string>(opts.grants)],
                        name: opts.application
                    }
                    auth.apps[ opts.application ] = app;
                }
                app.grants = [...new Set<string>(opts.grants)];
                app.status = "offline";

                let releaseOptions:ServerReleaseOptions = {
                    grants: [],
                    server: auth.agent,
                    application: opts.application
                };
                let clients = this.saio.clientsOf({ server: auth.agent, application: opts.application });
                clients.forEach( client => {
                    releaseOptions.grants = [ client.props().agent ];
                    client.send( "applicationOffline", releaseOptions );
                });

                this.notifySafe( "applicationOffline", opts )
                    .forEach( value => {
                        if( value.error ) this.notifySafe( "error", value.error, "applicationOffline" );
                    })
            });

            socket.on( "close", () => {
                console.log( `server.agent:close agent = "${socket.props().agent}"`)

                let auth = this.saio.agents[ socket.props().agent ];
                if( !auth ) return;
                if( auth.connection.id() === socket.id() ){
                    //Fechar todos os slots de conexão aberto inicializado pelo agente que acabou de encerar a ligação
                    Object.values( this.saio.serverSlots[ auth.agent ] ).forEach( apps => {
                        Object.values( apps ).forEach( value => {
                            value.connect.end();
                        })
                    });

                    //Fechar todas as esperas de conexão aguardando pelo agente
                    Object.values( this.saio.waitConnections[ auth.agent ]).forEach( apps => {
                        Object.values( apps ).forEach( waitApp => {
                            waitApp.connection.end();
                        })
                    });

                    //Fechar todas as esperas inicializada pelo agent que acabou-se de terminar a conexão
                    Object.values( this.saio.waitConnections )
                        .forEach( servers => {
                            Object.values( servers ).forEach( apps => {
                                Object.values( apps ).forEach( value => {
                                    if( value.connection.props().client !== auth.agent ) return;
                                    value.connection.end();
                                })
                            });
                        })
                    delete this.saio.agents[ auth.agent ]
                }
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