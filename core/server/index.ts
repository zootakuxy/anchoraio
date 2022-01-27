import "../global/init"
import {
    asLine,
    ChunkLine,
    Event,
    eventCode,
    SocketConnection,
    writeInSocket
} from "../global/share";
import net from "net";
import {nanoid} from "nanoid";
import {SlotManager, SlotName} from "../global/slot";
import {ServerOptions} from "./opts";


type ServerConnection={
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


export const root: {
    connections:{[p:string]:ServerConnection},
    servers:{[p:string]:string},
    req:{[p:string]:string},
} = { connections: {}, req: {}, servers:{}}


type EventName = string|Event;


export default function ( serverOpts:ServerOptions  ){
    function createConnectionId ( socket:net.Socket, namespace, metadata?:{[p:string|number]:any} ){
        socket.on( "error", err => { console.error( err ) } );
        let id = `${namespace}://${nanoid( 32 )}`;
        socket[ "id" ] = id;
        let _once:{ [p:string]:(( event:string, ...data)=>void)[ ]} = new Proxy( {}, {
            get(target, p): any {
                if( !target[p] ) target[p] = [];
                return target[ p ];
            }
        })
        let _on:{ [p:EventName]:(( event:EventName, ...data)=>void)[ ]} = new Proxy( {}, {
            get(target, p ): any {
                if( !target[p] ) target[p] = [];
                return target[ p ];
            }
        })
        let _status = {
            connected:true
        };

        socket.on( "close", hadError =>{
            _status.connected = false
        });
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
                _on[ event ].forEach( (value) => value( event, ...data ) );
                _on[ "*" ].forEach( (value) => value( event, ...data ) );
            }
        }
        root.connections[ id ] = connection;
        writeInSocket(socket, { id } );
        return connection;
    }

    function requireSlot( slotName:SlotName, connection:ServerConnection ):Promise<boolean>{
        return new Promise<boolean>( (resolve ) => {
            let slotCode = nanoid(16 );
             writeInSocket( connection.socket, {
                 type: Event.AIO,
                 slot:slotName,
                 slotCode
            });
            connection.once( eventCode( Event.AIO, slotCode ),()=>{
                return resolve( !!connection.slots[slotName].length );
            })
        })
    }

    const serverSlotManager = new SlotManager<ServerConnection>({
        slots( server:ServerConnection){ return server.slots },
        handlerCreator( slotName:SlotName, anchorID:string, server:ServerConnection, ...opts ){
            return requireSlot(  slotName, server )
        }
    })

    function start(){
        net.createServer( socket => {
            createConnectionId( socket, "anchor" );
        }).listen( serverOpts.anchorPort );

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
                            serverSlotManager.nextSlot( SlotName.OUT, opts.anchor_form, connection ),
                            serverSlotManager.nextSlot( SlotName.IN, null, serverResolve )
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

        }).listen( serverOpts.serverPort );
    }

    start();
}
