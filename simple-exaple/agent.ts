import "./init"
import {apps, hosts, identifier} from "./maps";
import * as net from "net";
import {Server} from "net";
import { ConnectionType, DEFAULT_SHARE, showHeader, SocketConnection } from "./share";
import {writeInSocket} from "./share";

const configs = {
    identifier: identifier,
    serverHost: DEFAULT_SHARE.SERVER_HOST,
    serverPort: DEFAULT_SHARE.SERVER_PORT,
    anchorPort: DEFAULT_SHARE.SERVER_ANCHOR_PORT,
    clientPort: DEFAULT_SHARE.AGENT_PORT,
    timeout: 1000*5,
    hosts: hosts,
    apps: apps
}

export type RegisterResult = {
    id: string,
    socket: net.Socket,
    anchor()
}
export function socketRegister<T>( socket:net.Socket, collector?:{ [p:string]:RegisterResult }, req?:net.Socket, metadata?:T, ):Promise<RegisterResult>{
    if( !metadata ) metadata = {} as any;
    return new Promise( (resolve, reject) => {
        socket.once( "data", data => {
            const _data = JSON.parse( data.toString("utf-8"));
            let id = _data.id;
            let socek:SocketConnection&T = Object.assign(socket, { id }, metadata );

            let result:RegisterResult = {
                id: id,
                socket: socek,
                anchor(){
                    if( req ){
                        req.pipe( socket );
                        socket.pipe( req );
                    }
                }
            }

            if( collector ){
                collector[ id ] = result;
                socket.on( "close", hadError => {
                    delete collector[ id ];
                });
            }
            resolve( result )
        });
    })
}

export const agent:{ local?:Server, server?: net.Socket, connections:{[p:string]: RegisterResult  }} = { connections:{} }


function createApp( application ){
    const app = configs.apps[ application ]
    let connection :net.Socket;
    if( app ){
        console.log("create app connection")
        connection = net.createConnection({
            host: app.address,
            port: app.port
        });
        connection.on( "error", err => console.log( "lserver:error", err.message ));
    } else if(Number.isSafeInteger( Number( application )) ) {
        console.log("create local connection")
        connection = net.createConnection({
            host: "127.0.0.1",
            port: Number( application )
        });
        connection.on( "error", err => console.log( "lserver:error", err.message ));
    }
    return connection;
}

function connect(){
    return new Promise((resolve, reject) => {

        agent.server = net.createConnection({
            host: configs.serverHost,
            port: configs.serverPort
        });

        console.log("connect to remote server center..." );
        agent.server.on("connect", () => {
            socketRegister( agent.server ).then(value => {
                console.log("connect to remote server center... [ok]" );
                writeInSocket( agent.server, {
                    type: [ConnectionType.SERVER],
                    origin: configs.identifier,
                    server: configs.identifier,
                    id: value.id
                });
            });
            resolve( true );
        });

        agent.server.on( "error", err => {
            setTimeout( ()=>{
                agent.server.connect( configs.serverPort );
            }, configs.timeout )
        });


        agent.server.on( "data", data => {
            let raw = data.toString();
            console.log( raw );
            let lines = raw.split("\n" );
            lines.filter( value => value && value.length ).forEach( (line)=>{
                onAgentNextLine( line );
            });

        })
    })
}

function onAgentNextLine( agentNextLine ){
    console.log( agentNextLine );
    let header = JSON.parse( agentNextLine );
    showHeader( header );
    let type:ConnectionType[] = header.type;
    if( !type ) return;

    if( type.includes( ConnectionType.CONNECTION ) ) {
        const origin = header["origin"];
        const application = header["application"];
        const anchor_form = header["anchor_form"];
        const remoteReq = net.createConnection({
            host: configs.serverHost,
            port: configs.anchorPort
        });

        socketRegister(remoteReq, agent.connections, null, {}).then(value => {
            writeInSocket( agent.server, {
                type: [ConnectionType.ANCHOR],
                anchor_form: anchor_form,
                anchor_to: value.id,
                application: application,
                origin: origin
            });
            let appResponse:net.Socket = createApp( application );
            if( appResponse ){
                appResponse.pipe( remoteReq );
                remoteReq.pipe( appResponse );
            } else {
                remoteReq.end();
            }
        });
    }
}

const next = function( req:net.Socket ) {

    req.on( "error", err => console.log( "req:error"))
    req.on( "close", err => console.log( "req:close"))
    console.log( "new connection on ", req.address() );

    const remoteAddressParts = req.address()["address"].split( ":" );
    const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
    const host = configs.hosts[ address ];

    if( !host ) return req.end( () => { console.log( "Cansel connection with", remoteAddressParts )});
    console.log( "new connection domain", host.server );

    const next = net.createConnection({
        host: configs.serverHost,
        port: configs.anchorPort
    });
    next.on( "error", err => console.log( "Error:TO"))

    socketRegister( next, agent.connections, req ).then(value => {
        writeInSocket( agent.server, {
            type: [ConnectionType.CONNECTION],
            origin: configs.identifier,
            server: host.server,
            application: host.application,
            id: value.id
        });
        value.anchor();
    })
};

function start(){
    console.log( "start local server..." );
    agent.local = net.createServer(req => { next( req  );})
        .listen( configs.clientPort, ()=>{
            console.log( "start local server...[ok]", configs.clientPort )
        });
}

connect().then(start);





