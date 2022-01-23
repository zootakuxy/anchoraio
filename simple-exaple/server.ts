import "./init"
import {writeInSocket} from "./share";
import net from "net";
import {ConnectionType, showHeader} from "./share";



type Connection = {
    socket: net.Socket,
    id:string,
    keys:string[]
    // data?:Buffer
    anchor:(id:string)=>void
}

const configs = {
    serverPort : 48000,
    anchorPort:  48001
}

export const root: {
    connections:{[p:string]:Connection},
    servers:{[p:string]:string},
    req:{[p:string]:string},
} = { connections: {}, req: {}, servers:{}}


function createConnectionId ( connection:net.Socket, group ){
    connection.on( "error", err => { } );
    let id = `${group}://${Math.trunc( Math.random()*9999999)}/${new Date().getTime()}`;
    connection[ "id" ] = id;
    root.connections[ id ] = {
        id: id,
        socket: connection,
        keys: [],
        anchor( id ){
            let otherSide = root.connections[ id ];
            otherSide.socket.pipe( this.socket );
            this.socket.pipe( otherSide.socket );
        }
    };
    writeInSocket(connection, { id } );
}


function onServerNextLine( serveNextLine, socket ){
    console.log( serveNextLine );
    let header = JSON.parse( serveNextLine );
    showHeader( header );

    let type:ConnectionType[] = header[ "type" ];

    if( type.includes( ConnectionType.SERVER ) ){
        /*
            origin: configs.identifier,
            server: configs.identifier,
            id: id
         */
        let origin = header[ "origin" ];
        let server = header[ "server" ];
        let id = header[ "id" ];
        const  connection = root.connections[id];
        connection.keys.push( id, server );
        root.servers[ server ] = id;
    }
    if(  type.includes( ConnectionType.CONNECTION ) ){
        /*
            origin: configs.identifier,
            server: host.server,
            application: host.application
            id: id
         */
        let origin = header[ "origin" ];
        let server = header[ "server" ];
        let application = header[ "application" ];
        let id = header[ "id" ];
        let serverResolve = root.connections[ root.servers[ server ] ];

        writeInSocket( serverResolve.socket, {
            origin: origin,
            type: [ConnectionType.CONNECTION ],
            application: application,
            anchor_form: id
        });

    }if ( type.includes( ConnectionType.ANCHOR ) ){
        let anchor_to = header[ "anchor_to" ];
        let anchor_form = header[ "anchor_form" ];
        let application = header[ "application" ];
        let origin = header[ "origin" ];

        let originAgent = root.connections[ root.servers[ origin] ];


        writeInSocket( socket, {
            type: [ConnectionType.ANCHOR],
            anchor_to: anchor_to,
            application: application
        })

        writeInSocket( originAgent.socket, {
            type: [ConnectionType.ANCHOR_READY],
            anchor_to: anchor_to,
            anchor_form: anchor_form
        });

        root.connections[ anchor_form ].anchor( anchor_to );
    }
}

export function start(){
    net.createServer( socket => {
        createConnectionId( socket, "connection" );
    }).listen( configs.anchorPort );

    net.createServer(function( socket) {
        createConnectionId( socket, "server" );

        socket.on( "data", data => {
            let raw = data.toString();
            console.log( raw );
            let lines = raw.split( "\n" );
            lines.filter( value => value && value.length ).forEach( (next)=>{
                onServerNextLine( next, socket );
            });
        });


    }).listen( configs.serverPort );
}

start();