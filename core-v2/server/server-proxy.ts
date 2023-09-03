import net from "net";
import {nanoid} from "nanoid";
import {TokenService} from "../services/token.service";
import {TokenOptions} from "../../aio/opts/opts-token";
export type ServerOptions = TokenOptions & {
    responsePort:number,
    requestPort:number
    authPort:number
}

type ServerSlot = {
    server:string,
    app:string|number,
    busy:boolean,
    id:string
    connect:net.Socket
};

type WaitConnection = {
    resolve:( slot:ServerSlot )=>void;
    connection:net.Socket
    resolved?: boolean,
    id?:string
}

export type AuthIO = {
    server:string
    app:string|number,
    authReferer:string,
    agent:string,
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

type AgentAutheicated = {
    connection:net.Socket,
    id:string,
    referer:string,
    agent:string,
    servers:string[],
}

export function prepareSocket ( socket:net.Socket ){
    socket["id"] = nanoid( 16 );
    socket[ "status" ] = "connected";
    socket.on( "close", hadError => {
        socket[ "status" ] = "disconnected";
    });
    return statusOf( socket );
}

export  type StatusOf = {
    id:string,
    status:"connected"|"disconnected"
}

export function statusOf  ( socket:net.Socket ):StatusOf{
    return {
        get id(){ return socket["id"]},
        get status(){ return socket[ "status" ] }
    }
}

export function anchor( requestSide:net.Socket, responseSide:net.Socket, requestData:any[], responseData){
    if( !requestData ) requestData = [];
    if( !responseData ) responseData = [];

    let __anchor = ( _left:net.Socket, _right:net.Socket, data:any[] ) => {
        _left.pipe( _right );
        _left.on( "close", hadError => {
            if( hadError ) _right.end();
        });
        _left[ "anchored" ] = true;
    }

    let __switchData = ( side:net.Socket, data:any[])=>{
        while ( data.length ){
            side.write( requestData.shift() );
        }
    }

    __anchor( requestSide, responseSide, requestData );
    __anchor( responseSide, requestSide, responseData );
    __switchData( responseSide, requestData );
    __switchData( requestSide, responseData );

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
            [app:string]:{[id:string]:ServerSlot}
        }
    } = createProxyObject();

    let waitConnections:{
        [server:string]:{
            [app:string]: {
                [ connection:string ]:WaitConnection
            }
        }
    } = createProxy();



    let release = ( slot:ServerSlot )=>  {
        let next = Object.entries( waitConnections[slot.server][slot.app]).find( ([key, wait], index) => {
            let waitStatus = statusOf( wait.connection );
            return !wait.resolved
                && waitStatus.status === "connected"
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
            delete serverSlots[ slot.server ][ slot.app ][ slot.id ];
            if( hadError ) console.log( `detached server connection for ${ slot.server }.${ slot.app } because origin ${ slot.id  } is closed!`)

        });
    }

    let resolver = ( server:string, app:string|number, wait:WaitConnection )=>{
        let status = statusOf( wait.connection );

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
        waitConnections[server][app][ status.id ] = wait;
        wait.connection.on( "close", hadError => {
            delete waitConnections[server][app][ status.id  ];
            if( hadError ) console.log( `detached wait connection for ${ app }.${ server } because remittent connection ${ status.id } is closed!`)
        });
    }

    let agents : {
        [p:string]: AgentAutheicated
    } = {}

    let clientOrigin = net.createServer( socket => {
        let status = prepareSocket( socket );
        socket.once( "data", (data) => {
            let end = ()=>{
                socket.end();
            }

            let str = data.toString();

            //Modo waitResponse server
            // console.log( "ON SERVER REDIRECT", data.toString() );
            let redirect:AuthIO = JSON.parse( str );


            let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
                return agentAuth.referer === redirect.authReferer
                    && agentAuth.agent === redirect.agent;
            });
            if(!auth ) return end();

            let datas = [];
            let listen = data =>{
                datas.push( data );
            }
            socket.on( "data", listen );

            resolver( redirect.server, redirect.app, {
                id: status.id,
                connection: socket,
                resolve( slot ){
                    anchor( socket, slot.connect, datas, [ ] );
                    socket.off( "data", listen );
                    socket.write("ready" );
                    slot.connect.write( "busy" );
                }
            })
        });

        socket.on( "error", err => {
            console.log( "clientOrigin-error", err.message )
        })
    });

    let serverDestine = net.createServer( socket => {
        prepareSocket( socket );
        socket.once( "data", data => {
            let str = data.toString();
            // console.log( "ON RELEASE IN SERVER", str );
            let pack:AuthIO = JSON.parse( str );

            let end = ()=>{
                socket.end();
            }
            let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
                return agentAuth.referer === pack.authReferer
                    && agentAuth.agent === pack.agent;
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

    let serverAuth = net.createServer( socket => {
        let socketStatus = prepareSocket( socket );
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
                    id: socketStatus.id,
                    referer: referer,
                    connection: socket,
                    agent: auth.agent,
                    servers: auth.servers
                };

                let servers = Object.keys( agents ).filter( value => auth.servers.includes( value ));
                let authResponse:AuthResult = {
                    id: socketStatus.id,
                    referer: referer,
                    availableServers: servers
                };

                socket.write( JSON.stringify({
                    event:"auth",
                    args:[ authResponse ]
                }));

                Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                    if( !agent.servers.includes( auth.agent ) ) return;
                    agent.connection.write( JSON.stringify({
                        event:"serverOpen",
                        args:[ auth.agent ]
                    }));
                });

                socket.on( "close", hadError => {
                    Object.entries( agents ).forEach( ([ keyId, agent], index) => {
                        if( !agent.servers.includes( auth.agent ) ) return;
                        agent.connection.write( JSON.stringify({
                            event:"serverClose",
                            args:[ auth.agent ]
                        }));
                    });
                })
            }

            let current = agents[ auth.agent ];
            if( !current ) return register();
            if( current.connection.closed ) return register();
            if( statusOf( current.connection ).status !== "connected" ) return register();

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

        socket.on( "close", hadError => {
            let agentServer = socket[ "agentServer" ];
            let referer = socket[ "referer" ];

            let agent = agents[ agentServer ];
            if( !agent ) return;
            if( statusOf( agent.connection ).id === socketStatus.id ) delete agents[ agentServer ]
        });


        socket.on( "error", err => {
            console.log( "server-auth-error", err.message )
        });
    });

    [{serverAuth}, {serverDestine}, {clientOrigin} ].forEach( (entry, index) => {
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

export function identifierOf( identifier:string ){
    if(! identifier.endsWith(".aio") ) return `${identifier}.aio`;
    return  identifier;
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