import "./init"
import {asLine, ChunkLine, Event, eventCode, headerMap, SlotName, SocketConnection, writeInSocket} from "./share";
import net from "net";
import {nanoid} from "nanoid";


type ServerConnection = {
    socket: SocketConnection,
    id:string,
    keys:string[],
    anchor:(anchor:string|ServerConnection)=>void,
    slots:{ [p in SlotName]:ServerConnection[]}
    busy?:boolean
    once( string:EventName, cb:( event:EventName, chunkLine?:ChunkLine)=>void )
    on( string:EventName, cb:( event:EventName, chunkLine?:ChunkLine )=>void )
    notify( string:EventName, chunkLine?:ChunkLine )
}

const configs = {
    serverPort : 48000,
    anchorPort:  48001
}

export const root: {
    connections:{[p:string]:ServerConnection},
    servers:{[p:string]:string},
    req:{[p:string]:string},
} = { connections: {}, req: {}, servers:{}}


type EventName = string|Event;



function createConnectionId ( socket:net.Socket, namespace, metadata?:{[p:string|number]:any} ){
    socket.on( "error", err => { } );
    let id = `${namespace}://${nanoid( 32 )}`;
    socket[ "id" ] = id;
    let _once:{ [p:string]:(( event:string, ...data)=>void)[ ]} = new Proxy( {}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[p] = [];
            return target[ p ];
        }
    })
    let _on:{ [p:EventName]:(( event:EventName, ...data)=>void)[ ]} = new Proxy( {}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[p] = [];
            return target[ p ];
        }
    })
    let _status = {
        connected:true
    };

    socket.on( "close", hadError => _status.connected = false );
    socket.on( "connect", () => _status.connected = true );

    let connection:ServerConnection = {
        id: id,
        socket: Object.assign(  socket, metadata||{}, {
            id: id,
            get connected(){ return _status.connected }
        }),
        keys: [],
        slots:{ [SlotName.OUT]:[], [SlotName.IN]:[] },
        anchor( anchor ){
            if( typeof anchor === "string" ) anchor = root.connections[ id ];
            anchor.socket.pipe( this.socket );
            this.socket.pipe( anchor.socket );

        }, once(event: EventName, cb:(event:EventName, ...data )=>void) { _once[ event ].push( cb );
        }, on(event: EventName, cb:(event:EventName, ...data )=>void) { _on[ event ].push( cb );
        }, notify( event, ...data ){
            _once[ event ].splice(0, _once[ event ].length) .forEach( value => value( event, ...data ) );
            _once[ "*" ].splice(0, _once[ event ].length) .forEach( value => value( event, ...data ) );
            _on[ event ].forEach( (value, index) => value( event, ...data ) );
            _on[ "*" ].forEach( (value, index) => value( event, ...data ) );
        }
    }
    root.connections[ id ] = connection;
    writeInSocket(socket, { id } );
    return connection;
}

function waitSlot(connection:ServerConnection, slotName:SlotName ):Promise<boolean>{
    return new Promise<boolean>( (resolve, reject) => {
        let slotCode = nanoid(16 );
         writeInSocket( connection.socket, {
             type: Event.AIO,
             slot:slotName,
             slotCode
        });
        connection.once( eventCode( Event.AIO, slotCode ), (event, ...data )=>{
            return resolve( !!connection.slots[slotName].length );
        })
    })
}

function nextSlotServer(agent:ServerConnection, slotName:SlotName, anchorID?:string ):Promise<ServerConnection>{
    if( anchorID ){
        let index = agent.slots[slotName].findIndex( value => value.id === anchorID );
        let next = agent.slots[ slotName ][ index ];
        agent.slots[ slotName ].splice( index, 1 );
        return Promise.resolve( next );
    }

    return new Promise( (resolve, reject) => {
        let next:ServerConnection;
        let _resolve = () =>{
            if( !next ) return false;
            if( next.busy ) return false;
            if( !next.socket.connected ) return false;
            next.busy = true;
            resolve( next );
            return  true;
        }

        while ( !next && agent.slots[ slotName].length ){
            next = agent.slots[ slotName ].shift();
            if( next.busy ) next = null;
        }
        if( _resolve() ) return;
        waitSlot( agent, slotName ).then( created => {
            if( created ) next = agent.slots[ slotName ].shift();
            if( _resolve() ) return;
            else nextSlotServer( agent, slotName, anchorID ).then( value => {
                next = value;
                _resolve()
            });
        });
    });
}

export function start(){
    net.createServer( socket => {
        createConnectionId( socket, "anchor" );
    }).listen( configs.anchorPort );

    net.createServer(function( socket) {
        const connection =  createConnectionId( socket, "server" );
        socket.on( "data", data => {
            asLine( data ).forEach( async chunkLine => {
                chunkLine.show();

                if( chunkLine.type.includes( Event.SERVER ) ){
                    let opts = chunkLine.as.SERVER;
                    const  connection = root.connections[opts.id];
                    connection.keys.push( opts.id, opts.server );
                    root.servers[ opts.server ] = opts.id;
                }

                if(  chunkLine.type.includes( Event.ANCHOR ) ){
                    let opts = chunkLine.as.ANCHOR;
                    let serverResolve = root.connections[ root.servers[ opts.server ] ];

                    Promise.all([
                        nextSlotServer( connection, SlotName.OUT, opts.anchor_form ),
                        nextSlotServer( serverResolve, SlotName.IN )
                    ]).then( value => {
                        const [ anchorOUT, anchorIN ] = value;
                        anchorOUT.anchor( anchorIN );
                        writeInSocket( serverResolve.socket, {
                            origin: opts.origin,
                            type: [ Event.ANCHOR ],
                            application: opts.application,
                            anchor_form: opts.anchor_form,
                            anchor_to: anchorIN.id
                        });
                    });
                }

                if( chunkLine.type.includes( Event.AIO ) ){
                    let opts = chunkLine.as.AIO;
                    let anchorConnection = root.connections[ opts.anchor ];
                    connection.slots[ opts.slot ].push( anchorConnection );
                    connection.notify( Event.AIO );
                    anchorConnection.socket.on( "close", ()=>{
                        let index = connection.slots[ opts.slot ].findIndex( value1 => value1.id === opts.anchor );
                        if( index !== -1 ) connection.slots[ opts.slot ].splice( index, 1 );
                    });
                }

                chunkLine.type.forEach( value => {
                    connection.notify( value, chunkLine );
                });
            })
        });


    }).listen( configs.serverPort );
}

start();

// const numCPUs = require('os').cpus().length;
//
// if (cluster.isMaster) {
//     console.log('Master process is running');
//     // Fork workers
//     for (let i = 0; i < numCPUs; i++) {
//         cluster.fork();
//     }
// } else {
//     start();
// }