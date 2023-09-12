import { createServer } from "net";
import {nanoid} from "nanoid";
import {TokenService} from "../services/token.service";
import {TokenOptions} from "../../aio/opts/opts-token";
import {asAnchorSocket, AnchorSocket, anchor} from "../net/anchor";
import {AuthSocketListener} from "../agent/agent-aio";
export type ServerOptions = TokenOptions & {
    responsePort:number,
    requestPort:number
    authPort:number
}

type ServerSlot<T> = {
    server:string,
    app:string|number,
    busy:boolean,
    id:string
    connect:AnchorSocket<T, any>
};

type WaitConnection<T> = {
    resolve:( slot:ServerSlot<T> )=>void;
    connection:AnchorSocket<T, any>
    resolved?: boolean,
    id?:string,
    agent:string
}

export type AuthIO = {
    server:string
    app:string|number,
    authReferer:string,
    origin:string,
    authId:string
}

export type AuthAgent = {
    agent:string,
    token:string,
    servers:string[]
}
export type AuthResult = {
    id:string,
    referer:string
    availableServers:string[]
}

type AgentAuthenticate<T> = {
    connection:AnchorSocket<T, AuthSocketListener >,
    id:string,
    referer:string,
    agent:string,
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
        console.log( `getaway response from ${ slot.server } to ${ slot.server} connected` );

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
            delete serverSlots[ slot.server ][ slot.app ][ slot.id ];
        });
        serverSlots[ slot.server ][ slot.app ][ slot.id ] = slot;
        slot.connect.on( "close", hadError => {
            console.log( `getaway response from ${ slot.server } to ${ slot.server} CLOSED` );
            delete serverSlots[ slot.server ][ slot.app ][ slot.id ];
        });
    }

    let resolver = ( server:string, app:string|number, wait:WaitConnection<{}> )=>{
        console.log( `getaway request from ${ wait.agent } to ${ app}.${ server } connected` );

        let entry = Object.entries( serverSlots[server][app] ).find( ([ key, value]) => {
            if( !value ) return false;
            return value.server === server
                && value.app === app
                && !value.busy
        });


        if( entry && entry[1] ){
            let next = entry[1];
            next.busy = true;
            delete serverSlots[server][app][ next.id ];
            wait.resolve( next );
            // console.log( "CALLBACK APPLIED!")
            return;
        }
        waitConnections[server][app][ wait.connection.id() ] = wait;
        wait.connection.on( "close", hadError => {
            console.log( `getaway request from ${ wait.agent } to ${ app}.${ server } CLOSED` );
            delete waitConnections[server][app][ wait.connection.id()  ];
            if( hadError ) console.log( `detached wait connection for ${ app }.${ server } because remittent connection ${ wait.connection.id() } is closed!`)
        });
    }

    let agents : {
        [p:string]: AgentAuthenticate<{}>
    } = {}

    let clientOrigin = createServer( _so => {
        let socket = asAnchorSocket( _so, {
            side: "server",
            method: "GET",
        });
        socket.once( "data", (data) => {
            let end = ()=>{
                socket.end();
            }

            let str = data.toString();

            //Modo waitResponse server
            // console.log( "ON SERVER REDIRECT", data.toString() );
            let redirect:AuthIO = JSON.parse( str );


            let [authKey, auth] = Object.entries( agents ).find( ([agent, agentAuth], index) => {
                return agentAuth.referer === redirect.authReferer
                    && agentAuth.agent === redirect.origin;
            })||[];
            if(!auth ) return end();

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
                    anchor( `${redirect.app}.${redirect.server}`, "CENTRAL", socket, slot.connect, datas, [ ] );
                    socket.off( "data", listen );
                    socket.write("ready" );

                    // let busy :ConnectionBusy = {
                    //     client: redirect.origin,
                    //     authId: redirect.authId
                    // }
                    // slot.connect.write( JSON.stringify(busy) );
                }
            })
        });

        socket.on( "error", err => {
            console.log( "clientOrigin-error", err.message )
        })
    });

    let serverDestine = createServer( _so => {
        let socket = asAnchorSocket( _so, {
            side: "server",
            method: "SET",
        } );
        socket.once( "data", data => {
            let str = data.toString();
            // console.log( "ON RELEASE IN SERVER", str );
            let pack:AuthIO = JSON.parse( str );

            let end = ()=>{
                socket.end();
            }
            let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
                return agentAuth.referer === pack.authReferer
                    && agentAuth.agent === pack.origin;
            });
            if(!auth ) return end();

            // console.log( "NEW SERVER RELEASE AUTH" );
            release( {
                app: pack.app,
                server: pack.server,
                busy: false,
                connect: socket,
                id: nanoid(32 )
            });
            // console.log( "ON SERVER AGENT READY")
        });

        socket.on( "error", err => {
            console.log( "serverDestine-error", err.message )
        })
    });

    let tokenService = new TokenService( opts );

    let serverAuth = createServer( _ns => {
        let socket = asAnchorSocket<any, AuthSocketListener>( _ns, {
            side: "server",
            method: "AUTH",
        });
        socket.once( "data", data => {
            let str = data.toString();
            let auth:AuthAgent = JSON.parse( str );
            let end = ( code?:string, message?:string )=>{
                socket.write( JSON.stringify({
                    event:"authFailed",
                    args:[ code, message ]
                }))
                socket.end();
                return;
            }

            if( !auth || !auth.agent || !auth.token ) return end( "1010", "Missing auth props");
            let token = tokenService.tokenOf( auth.agent );
            if( !token ) return end( "1011", "Token not found" );
            if( !token.token ) return end( "Token invalid" );
            if( token.token.token !== auth.token ) return  end( "1012","Invalid token math" );
            if( token.token.status !== "active" ) return end("1013",`Invalid token status ${ token.token.status }`);

            let register = ()=>{
                let referer = `${nanoid(16 )}`;
                socket[ "referer" ] = referer;
                socket[ "agentServer" ] = auth.agent;
                if( !auth.servers ) auth.servers = [];

                agents[ auth.agent ]  = {
                    id: socket.id(),
                    referer: referer,
                    connection: socket,
                    agent: auth.agent,
                    servers: auth.servers
                };

                let servers = Object.keys( agents ).filter( value => auth.servers.includes( value ));
                // let authResponse:AuthResult = ;

                socket.send("auth", {
                    id: socket.id(),
                    referer: referer,
                    availableServers: servers
                } );

                // socket.write( JSON.stringify({
                //     event:"auth",
                //     args:[ authResponse ]
                // }));

                Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                    if( agent.agent === auth.agent ) return;
                    if( !agent.servers.includes( auth.agent ) ) return;
                    agent.connection.send("serverOpen", auth.agent );
                    // agent.connection.write( JSON.stringify({
                    //     event:"serverOpen",
                    //     args:[ auth.agent ]
                    // }));
                });

                socket.on( "close", hadError => {
                    Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                        if( agent.agent === auth.agent ) return;
                        if( !agent.servers.includes( auth.agent ) ) return;
                        agent.connection.send( "serverClose", auth.agent );
                        // agent.connection.write( JSON.stringify({
                        //     event:"serverClose",
                        //     args:[ auth.agent ]
                        // }));
                    });
                })
            }

            let current = agents[ auth.agent ];
            if( !current ) return register();
            if( current.connection["closed"] ) return register();
            if( current.connection.status() !== "connected" ) return register();

            //Check if is alive
            let checkAliveCode = nanoid(32 );
            let checkAlive = JSON.stringify({
                event:"isAlive",
                args:[ checkAliveCode ]
            })

            let timeoutCode = setTimeout(()=>{
                timeoutCheck();
            }, 5000 );
            let listenResponse = ( data:Buffer ) =>{
                let str  = data.toString();
                try {
                    let pack = JSON.parse( str );
                    if( pack.event === "isAlive" && pack?.args?.[0]===checkAliveCode && pack?.[1] === current.referer ) {
                        timeoutCheck = ()=>{};
                        clearTimeout( timeoutCode );
                        return end( "1014","Another agent instance is connected!" );
                    }
                } catch (e) { }
            }
            let timeoutCheck = ()=>{
                current.connection.off( "data", listenResponse );
                try { current.connection.destroy( new Error( "zombie socket" ) );
                } catch (e){ }
                register();
            }

            current.connection.on( "data", listenResponse );
            current.connection.write( JSON.stringify( checkAlive ) );
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

    [{serverAuth}, {serverDestine}, {clientOrigin} ].forEach( (entry) => {
        Object.entries( entry ).forEach( ([key, server]) => {
            server.on("error", err => {
               console.log( key, "error", err.message );
           });
        });
    });

    serverAuth.listen( opts.authPort );
    serverDestine.listen( opts.responsePort );
    clientOrigin.listen( opts.requestPort );
}









// import net from "net";
// import {nanoid} from "nanoid";
// import {TokenService} from "../services/token.service";
// import {TokenOptions} from "../../aio/opts/opts-token";
// export type ServerOptions = TokenOptions & {
//     responsePort:number,
//     requestPort:number
//     authPort:number
// }
//
// type ServerSlot = {
//     server:string,
//     app:string|number,
//     busy:boolean,
//     id:string
//     connect:net.Socket
// };
//
// type WaitConnection = ( slot:ServerSlot )=>void;
//
// export type AuthIO = {
//     server:string
//     app:string|number,
//     authReferer:string,
//     agent:string,
// }
//
// export type AuthAgent = {
//     agent:string,
//     token:string
// }
// export type AuthResult = {
//     id:string,
//     referer:string
// }
//
// type AgentAutheicated = {
//     connection:net.Socket,
//     id:string,
//     referer:string,
//     agent:string,
// }
//
// export function server( opts:ServerOptions){
//
//     let createProxy = ()=>{
//         return new Proxy({}, {
//             get(target: {}, p: string | symbol, receiver: any): any {
//                 if( !target[p]) target[p] = new Proxy({}, {
//                     get(target: {}, p: string | symbol, receiver: any): any {
//                         if( !target[p]) target[p] = [];
//                         return target[p];
//                     }
//                 })
//                 return target[p];
//             }
//         })
//     }
//
//     let createProxyObject = ()=>{
//         return new Proxy({}, {
//             get(target: {}, p: string | symbol, receiver: any): any {
//                 if( !target[p]) target[p] = new Proxy({}, {
//                     get(target: {}, p: string | symbol, receiver: any): any {
//                         if( !target[p]) target[p] = {};
//                         return target[p];
//                     }
//                 })
//                 return target[p];
//             }
//         })
//     }
//
//     let serverSlots:{
//         [server:string]:{
//             [app:string]:{[id:string]:ServerSlot}
//         }
//     } = createProxyObject();
//
//     let waitConnections:{
//         [server:string]:{
//             [app:string]:WaitConnection[]
//         }
//     } = createProxy()
//
//     let release = ( slot:ServerSlot )=>  {
//         let next = waitConnections[slot.server][slot.app].shift();
//         if( typeof next === "function" ) {
//             next( slot );
//             return;
//         }
//         slot.connect.on( "close", hadError => {
//             delete serverSlots[ slot.server ][ slot.app ][ slot.id ];
//         });
//         serverSlots[ slot.server ][ slot.app ][ slot.id ] = slot;
//     }
//
//     let connect = ( server:string, app:string|number, waitFor:string, callback:WaitConnection )=>{
//
//         let entry = Object.entries( serverSlots[server][app] ).find( ([ key, value]) => {
//             if( !value ) return false;
//             return value.server === server
//                 && value.app === app
//                 && !value.busy
//         });
//
//         console.log( serverSlots )
//
//         if( entry && entry[1] ){
//             let next = entry[1];
//             next.busy = true;
//             delete serverSlots[server][app][ next.id ];
//             callback( next );
//             console.log( "CALLBACK APPLIED!")
//             return;
//         }
//         waitConnections[server][app].push( callback );
//         console.log( "CALLBACK REGISTRED!" );
//     }
//
//     let agents : {
//         [p:string]: AgentAutheicated
//     } = {}
//
//     let clientOrigin = net.createServer( socket => {
//         socket["id"] = nanoid(16 );
//         console.log( "NEW CLIENT REQUEST ON SERVER", opts.requestPort );
//         socket.once( "data", (data) => {
//             let end = ()=>{
//                 socket.end();
//             }
//
//             let str = data.toString();
//
//             //Modo waitResponse server
//             console.log( "ON SERVER REDIRECT", data.toString() );
//             let redirect:AuthIO = JSON.parse( str );
//
//
//             let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
//                 return agentAuth.referer === redirect.authReferer
//                     && agentAuth.agent === redirect.agent;
//             });
//             if(!auth ) return end();
//
//             let datas = [];
//             let listen = data =>{
//                 datas.push( data );
//             }
//             socket.on( "data", listen );
//
//             console.log( "ON SERVER REDIRECT AUTH", socket["id"], new Date() );
//             connect( redirect.server, redirect.app, socket["id"],slot => {
//                 while ( datas.length ){
//                     slot.connect.write(  datas.shift() );
//                 }
//                 slot.connect.pipe( socket );
//                 socket.pipe( slot.connect );
//                 socket.off( "data", listen );
//                 socket.write("ready" );
//                 console.log( "SERVER REDIRECT READY", socket["id"], new Date())
//             });
//             //Modo waitResponse server | END
//         });
//
//         socket.on( "error", err => {
//             console.log( "clientOrigin-error", err.message )
//         })
//     });
//
//     let serverDestine = net.createServer( socket => {
//         console.log( "NEW SERVER RELEASE ON CONNECTION" );
//         socket.once( "data", data => {
//             let str = data.toString();
//             console.log( "ON RELEASE IN SERVER", str );
//             let pack:AuthIO = JSON.parse( str );
//
//             let end = ()=>{
//                 socket.end();
//             }
//             let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
//                 return agentAuth.referer === pack.authReferer
//                     && agentAuth.agent === pack.agent;
//             });
//             if(!auth ) return end();
//
//             console.log( "NEW SERVER RELEASE AUTH" );
//             release( {
//                 app: pack.app,
//                 server: pack.server,
//                 busy: false,
//                 connect: socket,
//                 id: nanoid(32 )
//             });
//             console.log( "ON SERVER AGENT READY")
//         });
//
//         socket.on( "error", err => {
//             console.log( "serverDestine-error", err.message )
//         })
//     });
//
//     let tokenService = new TokenService( opts );
//
//     let serverAuth = net.createServer( socket => {
//         let id = nanoid(16 );
//         socket[ "id" ] = id;
//         socket["connectionStatus"] = "connected";
//         socket.on( "close", hadError => {
//             socket["connectionStatus"] = "disconnected";
//         })
//
//         socket.once( "data", data => {
//             let str = data.toString();
//             let auth:AuthAgent = JSON.parse( str );
//             let end = ( code?:string, message?:string )=>{
//                 socket.write( JSON.stringify({
//                     event:"authFailed",
//                     args:[ code, message ]
//                 }))
//                 socket.end();
//                 return;
//             }
//
//             if( !auth || !auth.agent || !auth.token ) return end( "1010", "Missing auth props");
//             let token = tokenService.tokenOf( auth.agent );
//             if( !token ) return end( "1011", "Token not found" );
//             if( !token.token ) return end( "Token invalid" );
//             if( token.token.token !== auth.token ) return  end( "1012","Invalid token math" );
//             if( token.token.status !== "active" ) return end("1013",`Invalid token status ${ token.token.status }`);
//
//             let register = ()=>{
//                 let referer = `${nanoid(16 )}`;
//                 socket[ "referer" ] = referer;
//                 socket[ "agentServer" ] = auth.agent;
//                 agents[ auth.agent ]  = {
//                     id: id,
//                     referer: referer,
//                     connection: socket,
//                     agent: auth.agent
//                 };
//                 let authResponse:AuthResult = {
//                     id: id,
//                     referer: referer
//                 };
//                 socket.write( JSON.stringify({
//                     event:"auth",
//                     args:[ authResponse ]
//                 }))
//             }
//
//             let current = agents[ auth.agent ];
//             if( !current ) return register();
//             if( current.connection.closed ) return register();
//             if( current.connection["connectionStatus"] !== "connected" ) return register();
//
//             //Check if is alive
//             let checkAliveCode = nanoid(32 );
//             let checkAlive = JSON.stringify({
//                 event:"isAlive",
//                 args:[ checkAliveCode ]
//             })
//
//             let timeoutCode = setTimeout(()=>{
//                 timeoutCheck();
//             }, 5000 );
//             let listenResponse = ( data:Buffer ) =>{
//                 let str  = data.toString();
//                 try {
//                     let pack = JSON.parse( str );
//                     if( pack.event === "isAlive" && pack?.args?.[0]===checkAliveCode && pack?.[1] === current.referer ) {
//                         timeoutCheck = ()=>{};
//                         clearTimeout( timeoutCode );
//                         return end( "1014","Another agent instance is connected!" );
//                     }
//                 } catch (e) { }
//             }
//             let timeoutCheck = ()=>{
//                 current.connection.off( "data", listenResponse );
//                 try { current.connection.destroy( new Error( "zombie socket" ) );
//                 } catch (e){ }
//                 register();
//             }
//
//             current.connection.on( "data", listenResponse );
//             current.connection.write( JSON.stringify( checkAlive ) );
//         });
//
//         socket.on( "close", hadError => {
//             let agentServer = socket[ "agentServer" ];
//             let referer = socket[ "referer" ];
//             let id = socket[ "id" ];
//
//             let agent = agents[ agentServer ];
//             if( !agent ) return;
//             if( agent.connection["id"] === socket[ "id" ] ) delete agents[ agentServer ]
//         });
//
//
//         socket.on( "error", err => {
//             console.log( "server-auth-error", err.message )
//         });
//     });
//
//     [{serverAuth}, {serverDestine}, {clientOrigin} ].forEach( (entry, index) => {
//         Object.entries( entry ).forEach( ([key, server]) => {
//             server.on("error", err => {
//                console.log( key, "error", err.message );
//            });
//         });
//     });
//
//     serverAuth.listen( opts.authPort );
//     serverDestine.listen( opts.responsePort );
//     clientOrigin.listen( opts.requestPort );
// }
//
// export function identifierOf( identifier:string ){
//     if(! identifier.endsWith(".aio") ) return `${identifier}.aio`;
//     return  identifier;
// }