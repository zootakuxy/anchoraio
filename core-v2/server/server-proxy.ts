import net from "net";
import {nanoid} from "nanoid";
import {TokenService} from "../services/token.service";
import {TokenOption} from "../../aio/opts/opts-token";
export type ServerOptions = TokenOption & {
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

type WaitConnection = ( slot:ServerSlot )=>void;

export type AuthIO = {
    server:string
    app:string|number,
    authReferer:string,
    agent:string,
}

export type AuthAgent = {
    agent:string,
    token:string
}
export type AuthResult = {
    id:string,
    referer:string
}

type AgentAutheicated = {
    connection:net.Socket,
    id:string,
    referer:string,
    agent:string,
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
            [app:string]:WaitConnection[]
        }
    } = createProxy()

    let release = ( slot:ServerSlot )=>  {
        let next = waitConnections[slot.server][slot.app].shift();
        if( typeof next === "function" ) {
            next( slot );
            return;
        }
        slot.connect.on( "close", hadError => {
            delete serverSlots[ slot.server ][ slot.app ][ slot.id ];
        });
        serverSlots[ slot.server ][ slot.app ][ slot.id ] = slot;
    }

    let connect = ( server:string, app:string|number, callback:WaitConnection )=>{
        if( !serverSlots[server][app] ) throw new Error("sdsdsds")

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
            callback( next );
            return;
        }
        waitConnections[server][app].push( callback );
    }

    let agents : {
        [p:string]: AgentAutheicated
    } = {}

    let clientOrigin = net.createServer( socket => {
        console.log( "NEW CLIENT REQUEST ON SERVER", opts.requestPort );
        socket.once( "data", (data) => {
            let end = ()=>{
                socket.end();
            }


            let str = data.toString();
            //Modo NoWait response Server
            console.log( "ON SERVER REDIRECT", str );
            let endPart = str.indexOf("}");
            let authPart = str.substring( 0, endPart+1 );
            let headPart = str.substring( endPart+1, str.length );

            let redirect:AuthIO = JSON.parse( authPart );

            let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
                return agentAuth.referer === redirect.authReferer
                    && agentAuth.agent === redirect.agent;
            });
            if(!auth ) return end();

            connect( redirect.server, redirect.app, slot => {
                if( headPart.length>0 ) slot.connect.write(Buffer.from(headPart))
                slot.connect.pipe( socket );
                socket.pipe( slot.connect );
                if( headPart.length > 0 )
                console.log( "SERVER REDIRECT READY")
            });
            //Modo NoWait response Server | END




            // //Modo waitResponse server
            // console.log( "ON SERVER REDIRECT", data.toString() );
            // let redirect:AuthIO = JSON.parse( str );
            //
            //
            // let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
            //     return agentAuth.referer === redirect.authReferer
            //         && agentAuth.agent === redirect.agent;
            // });
            // if(!auth ) return end();
            //
            // let datas = [];
            // let listen = data =>{
            //     datas.push( data );
            // }
            // socket.on( "data", listen );
            //
            // console.log( "ON SERVER REDIRECT AUTH" );
            // connect( redirect.server, redirect.app, slot => {
            //     while ( datas.length ){
            //         slot.connect.write(  datas.shift() );
            //     }
            //     slot.connect.pipe( socket );
            //     socket.pipe( slot.connect );
            //     socket.off( "data", listen );
            //     socket.write("ready" );
            //     console.log( "SERVER REDIRECT READY")
            // });
            // //Modo waitResponse server | END
        });

        socket.on( "error", err => {
            console.log( "clientOrigin-error", err.message )
        })
    });

    let serverDestine = net.createServer( socket => {
        console.log( "NEW SERVER RELEASE ON CONNECTION" );
        socket.once( "data", data => {
            let str = data.toString();
            console.log( "ON RELEASE IN SERVER", str );
            let pack:AuthIO = JSON.parse( str );

            let end = ()=>{
                socket.end();
            }
            let auth = Object.entries( agents ).find( ([agent, agentAuth], index) => {
                return agentAuth.referer === pack.authReferer
                    && agentAuth.agent === pack.agent;
            });
            if(!auth ) return end();

            console.log( "NEW SERVER RELEASE AUTH" );
            release( {
                app: pack.app,
                server: pack.server,
                busy: false,
                connect: socket,
                id: nanoid(32 )
            });
            console.log( "ON SERVER AGENT READY")
        });

        socket.on( "error", err => {
            console.log( "serverDestine-error", err.message )
        })
    });

    let tokenService = new TokenService( opts );

    let serverAuth = net.createServer( socket => {
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
            if( agents[auth.agent ] ) return end( "1014","Another agent instance is connected!" );

            let id = nanoid(16 );
            let referer = `${nanoid(16 )}`;
            socket["id"] = id;
            agents[ auth.agent ]  = {
                id: id,
                referer: referer,
                connection: socket,
                agent: auth.agent
            };

            socket.on( "close", hadError => {
                let agent = agents[auth.agent];
                if( !!agent && agent.id === id ) delete agents[ auth.agent ];
            });

            let authResponse:AuthResult = {
                id: id,
                referer: referer
            };
            socket.write( JSON.stringify({
                event:"auth",
                args:[ authResponse ]
            }))
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