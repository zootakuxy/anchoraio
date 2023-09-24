import { createServer } from "net";
import {nanoid} from "nanoid";
import {TokenService} from "../services";
import {TokenOptions} from "../../aio/opts/opts-token";
import {
    AnchorSocket,
    anchor,
    asListenableAnchorConnect,
    asAnchorConnect,
    ListenableAnchorSocket
} from "../net";
import { AuthSocketListener, RequestGetawayAuth, ApplicationGetawayAuth} from "../net";
export type ServerOptions = TokenOptions & {
    responsePort:number,
    requestPort:number
    authPort:number
}

type ServerSlot<T> = {
    server:string,
    grants:string[],
    app:string|number,
    busy:boolean,
    slotId:string
    connect:ListenableAnchorSocket<T, {
        busy( origin:string ),
        auth( authData:ApplicationGetawayAuth )
    }>
};

type WaitConnection<T> = {
    resolve:( slot:ServerSlot<T> )=>void;
    connection:AnchorSocket<T>
    resolved?: boolean,
    id?:string,
    agent:string
}

type App = {
    name:string,
    grants:string[]
}
type AgentAuthenticate = {
    id:string,
    referer:string,
    agent:string,
    apps:{
        [application:string]:App
    }
    machine:string
    servers:string[],
}


export function server( opts:ServerOptions){
    let createProxy = ()=>{
        return new Proxy({}, {
            get(target: {}, p: string | symbol, receiver: any): any {
                if( !target[p]) target[p] = new Proxy({}, {
                    get(target: {}, p: string | symbol, receiver: any): any {
                        if( !target[p]) target[p] = [];
                        return target[p];
                    }
                })
                return target[p];
            }
        })
    }

    let createProxyObject = ()=>{
        return new Proxy({}, {
            get(target: {}, p: string | symbol, receiver: any): any {
                if( !target[p]) target[p] = new Proxy({}, {
                    get(target: {}, p: string | symbol, receiver: any): any {
                        if( !target[p]) target[p] = {};
                        return target[p];
                    }
                })
                return target[p];
            }
        })
    }

    let serverSlots:{
        [server:string]:{
            [app:string]:{[id:string]:ServerSlot<{}>}
        }
    } = createProxyObject();

    let waitConnections:{
        [server:string]:{
            [app:string]: {
                [ connection:string ]:WaitConnection<{}>
            }
        }
    } = createProxy();

    let release = ( slot:ServerSlot<{}> )=>  {
        console.log( `server.release getaway response for application = "${slot.app}" server = "${ slot.server}" connected` );

        let next = Object.entries( waitConnections[slot.server][slot.app]).find( ([key, wait], index) => {
            return !wait.resolved
                && wait.connection.status() === "connected"
            ;
        });

        if( !!next ) {
            let [ key, wait ] = next;
            wait.resolved = true;
            delete waitConnections[slot.server][slot.app][ wait.id ];
            wait.resolve ( slot );
            return;
        }
        slot.connect.on( "close", hadError => {
            delete serverSlots[ slot.server ][ slot.app ][ slot.connect.id() ];
        });
        serverSlots[ slot.server ][ slot.app ][ slot.connect.id() ] = slot;
        slot.connect.on( "close", hadError => {
            console.log( `server.release getaway response for application = "${slot.app}" server = "${ slot.server}" CLOSED` );
            delete serverSlots[ slot.server ][ slot.app ][ slot.connect.id() ];
        });
    }

    let resolver = ( server:string, app:string|number, wait:WaitConnection<{}> )=>{
        console.log( `server.resolver getaway request from ${ wait.agent } to ${ app}.${ server } connected` );

        let entry = Object.entries( serverSlots[server][app] ).find( ([ key, value]) => {
            if( !value ) return false;
            return value.server === server
                && value.app === app
                && !value.busy
        });

        if( entry && entry[1] ){
            console.log( `server.resolver:RESOLVER_IMMEDIATELY ` )
            let next = entry[1];
            next.busy = true;
            delete serverSlots[server][app][ next.connect.id() ];
            wait.resolve( next );
            return;
        }
        console.log( `server.resolver:RESOLVER_WAIT` )

        waitConnections[server][app][ wait.connection.id() ] = wait;
        wait.connection.on( "close", hadError => {
            console.log( `server.resolver getaway request from ${ wait.agent } to ${ app}.${ server } CLOSED` );
            delete waitConnections[server][app][ wait.connection.id()  ];
            if( hadError ) console.log( `detached wait connection for ${ app }.${ server } because remittent connection ${ wait.connection.id() } is closed!`)
        });
    }

    let agents : {
        [p:string]: AgentAuthenticate & {
            connection:ListenableAnchorSocket<AgentAuthenticate, AuthSocketListener >,
        }
    } = {}

    let requestGetawaySever = createServer(_so => {
        let socket = asAnchorConnect( _so, {
            side: "server",
            method: "GET",
        });
        socket.once( "data", (data) => {
            let end = ( message:string )=>{
                console.log( `server.requestGetawaySever:end massage = "${message}"`)
                socket.end();
            }

            let str = data.toString();

            //Modo waitResponse server
            let redirect:RequestGetawayAuth = JSON.parse( str );

            let auth = Object.entries( agents )
                .map( value => value[1])
                .find( (agentAuth, index) => {
                return agentAuth.referer === redirect.authReferer
                    && agentAuth.agent === redirect.origin
                    && agentAuth.machine === redirect.machine
            })
            if(!auth ) return end( "Agent not authenticated" );
            let resolverApp = agents?.[ redirect.server ]?.apps?.[ redirect.app ];
            if( !resolverApp ) return end( "Resolved application not found");
            let grants = [ "*", redirect.origin ].find( value => resolverApp.grants.includes( value ) )
            if( !grants ) return end( "Permission dined for application");

            let datas = [];
            let listen = data =>{
                datas.push( data );
            }
            socket.on( "data", listen );

            resolver( redirect.server, redirect.app, {
                id: socket.id(),
                connection: socket,
                agent: auth.agent,
                resolve( slot ){
                    anchor( `${redirect.app}.${redirect.server}`, "CENTRAL", socket, slot.connect, datas, [] );
                    socket.off( "data", listen );
                    socket.write("ready" );
                    agents[ slot.server ].connection.send( "busy", {
                        application: redirect.app,
                        slotId: slot.slotId,
                        origin: redirect.origin
                    });
                }
            })
        });

        socket.on( "error", err => {
            console.log( "clientOrigin-error", err.message )
        })
    });

    let responseGetawayApplication = createServer(_so => {
        let socket = asListenableAnchorConnect<any,{
            busy( origin:string ),
            auth( authData:ApplicationGetawayAuth )
        }>( _so, {
            side: "server",
            method: "SET",
        });

        socket.eventListener().once( "auth", pack => {
            // socket.on( "data", data => {
            //     console.log( "=================== [ SERVER:RESPONSE FOR APPLICATION GETAWAY ] ===================")
            //     console.log( data.toString() );
            //     console.log( "=================== [                                         ] ===================")
            // });
            socket.stopListener();
            let end = ()=>{
                socket.end();
            }
            let auth = Object.entries( agents )
                .map( value => value[1] ).find( (agentAuth, index) => {
                if( agentAuth.referer === pack.authReferer
                    && agentAuth.agent === pack.origin
                    && agentAuth.machine === pack.machine
                ) return agentAuth;
                return null;
            });


            if(!auth ) return end();

            auth.apps[ pack.app ] = {
                grants: pack.grants,
                name: pack.app
            }

            release( {
                app: pack.app,
                server: pack.server,
                grants: pack.grants,
                busy: false,
                connect: socket,
                slotId: pack.slotId
            });
        });

        socket.on( "error", err => {
            console.log( "serverDestine-error", err.message )
        })
    });

    let tokenService = new TokenService( opts );

    let serverAuth = createServer( _ns => {
        let socket = asListenableAnchorConnect<any, AuthSocketListener>( _ns, {
            side: "server",
            method: "AUTH",
        });

        socket.eventListener().once( "auth", auth => {
            let end = ( code?:string, message?:string )=>{
                socket.write( JSON.stringify({
                    event:"authFailed",
                    args:[ code, message ]
                }))
                socket.end();
                return;
            }

            if( !auth || !auth.agent || !auth.token || !auth.machine ) return end( "1010", "Missing auth props");
            let token = tokenService.tokenOf( auth.agent );
            if( !token ) return end( "1011", "Token not found" );
            if( !token.token ) return end( "Token invalid" );
            if( token.token.token !== auth.token ) return  end( "1012","Invalid token math" );
            if( token.token.status !== "active" ) return end("1013",`Invalid token status ${ token.token.status }`);
            if( !token.token.machine ){
                token = tokenService.link( auth.agent, auth.machine )
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
                agents[ auth.agent ]  = Object.assign( agentAuthenticate, {
                    connection: socket,
                });

                    let servers = Object.keys( agents ).filter( value => auth.servers.includes( value ));
                // let authResponse:AuthResult = ;

                socket.send("authResult", {
                    id: socket.id(),
                    referer: referer,
                    availableServers: servers
                } );

                Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                    if( agent.agent === auth.agent ) return;
                    if( !agent.servers.includes( auth.agent ) ) return;
                    let apps = [ ];
                    if( apps.length ) agent.connection.send("remoteServerOpen", auth.agent );
                });

                socket.on( "close", hadError => {
                    Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                        if( agent.agent === auth.agent ) return;
                        if( !agent.servers.includes( auth.agent ) ) return;
                        agent.connection.send( "remoteServerClosed", auth.agent );
                    });
                })
            }

            let current = agents[ auth.agent ];
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
            Object.entries( agents ).forEach( ([ keyId, agent], index) => {
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
        });

        socket.eventListener().on( "appServerClosed", ( opts) => {
            let auth = socket.props();
            let notify = [];
            Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                if( agent.agent === auth.agent ) return;
                if( !agent.servers.includes( auth.agent ) ) return;
                agent.connection.send( "appServerClosed", {
                    grants: opts.grants,
                    server: auth.agent,
                    application: opts.application
                });
            });
        });

        socket.on( "close", () => {
            let agentServer = socket[ "agentServer" ];
            let referer = socket[ "referer" ];

            let agent = agents[ agentServer ];
            if( !agent ) return;
            if( agent.connection.id() === socket.id() ) delete agents[ agentServer ]
        });

        socket.on( "error", err => {
            console.log( "server-auth-error", err.message )
        });
    });

    [{serverAuth}, {serverDestine: responseGetawayApplication}, {clientOrigin: requestGetawaySever} ].forEach( (entry) => {
        Object.entries( entry ).forEach( ([key, server]) => {
            server.on("error", err => {
               console.log( key, "error", err.message );
           });
        });
    });

    serverAuth.listen( opts.authPort );
    responseGetawayApplication.listen( opts.responsePort );
    requestGetawaySever.listen( opts.requestPort );
}