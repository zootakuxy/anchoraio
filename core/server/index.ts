import "../global/init"
import {
    asLine,
    ChunkLine, Emitter,
    Event,
    eventCode, headerMap,
    SocketConnection,
    writeInSocket
} from "../global/share";
import net from "net";
import {nanoid} from "nanoid";
import {SlotManager, SlotType} from "../global/slot";
import {ServerOptions} from "./opts";
import chalk from "chalk";


type ServerConnection={
    socket: SocketConnection,
    id:string,
    keys:string[],
    anchor:(anchor:string|ServerConnection)=>void,
    slots:{ [p in SlotType]:ServerConnection[]}
    busy?:boolean,
    close()
    once( string:EventName, cb:( event:EventName, chunkLine?:ChunkLine)=>void )
    on( string:EventName, cb:( event:EventName, chunkLine?:ChunkLine )=>void )
    notify( string:EventName, chunkLine?:ChunkLine )
}


export const root: {
    _last?:number
    connections:{[p:string]:ServerConnection},
    servers:{[p:string]:string},
    req:{[p:string]:string},
    next:number
} = { connections: {}, _last:0, req: {}, servers:{}, get next(){
    this._last = this._last || 0;
    return ++this._last;
}}


type EventName = string|Event;


export default function ( serverOpts:ServerOptions  ){
    function createConnectionId ( socket:net.Socket, namespace, metadata?:{[p:string|number]:any} ){
        socket.on( "error", err => { console.error( err ) } );
        let id = `${namespace}://${nanoid( 32 )}|${ root.next }`;
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
            delete root.connections[ id ];
        });
        socket.on( "connect", () => _status.connected = true );

        let connection:ServerConnection = {
            id: id,
            socket: Object.assign(  socket, metadata||{}, {
                id: id,
                get connected(){ return _status.connected }
            }),
            keys: [],
            slots:{ [SlotType.OUT]:[], [SlotType.IN]:[] },
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
            }, close() {
                socket.end( () => { });
            }
        }
        root.connections[ id ] = connection;
        writeInSocket(socket, { id } );
        return connection;
    }

    function requireSlot(slotName:SlotType, connection:ServerConnection ):Promise<boolean>{
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
        slots( server:ServerConnection){ return server?.slots },
        handlerCreator(slotName:SlotType, anchorID:string, server:ServerConnection, ...opts ){
            return requireSlot(  slotName, server )
        }
    })

    function start(){
        net.createServer( socket => {
            createConnectionId( socket, "anchor" );
        }).listen( serverOpts.anchorPort, ()=>{
            console.log( `[ANCHORAIO] Server anchor port liste on  ${ serverOpts.anchorPort }`)
        } );

        net.createServer(function( socket) {
            const connection =  createConnectionId( socket, "server" );

            socket.on( "data", data => {
                console.log( data.toString() );

                asLine( data ).forEach( async chunkLine => {
                    chunkLine.show();

                    //Quando o agent identifica-se no servidor
                    if( chunkLine.type.includes( Event.SERVER ) ){

                        let opts = chunkLine.as.SERVER;

                        let _id = root.servers[ opts.server ];
                        let _server = root.connections[ _id ];
                        if( _id && _server && _server.socket.connected ){
                            console.log( "[ANCHORAIO] Server>", chalk.redBright( `Already exists another agent for ${ opts.server }. CONNECTION REJECTED!`));
                            writeInSocket( socket, headerMap.REJECTED( opts ));
                            return;
                        }

                        const  connection = root.connections[ opts.id ];
                        connection.keys.push( opts.id, opts.server );
                        root.servers[ opts.server ] = opts.id;
                        console.log( "[ANCHORAIO] Server>", chalk.greenBright( `Agent ${ opts.server } connected with id ${ opts.id } `));
                        writeInSocket( connection.socket, headerMap.ACCEPTED( opts ))
                    }

                    //Quando o agente solicita uma nova anchora
                    if(  chunkLine.type.includes( Event.ANCHOR ) ){
                        let opts = chunkLine.as.ANCHOR;
                        let serverResolve = root.connections[ root.servers[ opts.server ] ];
                        if( !serverResolve ) {
                            console.log( "[ANCHORAIO] Server>", chalk.redBright `Anchor from ${ chunkLine.header.anchor_form } to ${ chunkLine.header.server } has CANCELLED!`)
                            return writeInSocket( connection.socket, headerMap.CANSEL( Object.assign(opts )))
                        }

                        Promise.all([
                            serverSlotManager.nextSlot( SlotType.OUT, opts.anchor_form, connection ),
                            serverSlotManager.nextSlot( SlotType.IN, null, serverResolve )
                        ]).then( value => {
                            const [ anchorOUT, anchorIN ] = value;
                            anchorOUT.anchor( anchorIN );
                            writeInSocket( serverResolve.socket, headerMap.ANCHOR(Object.assign( opts, {
                                anchor_to: anchorIN.id,
                            })));
                            console.log( "[ANCHORAIO] Server>",  `Anchor from ${ chunkLine.header.anchor_form } to ${ chunkLine.header.server } has ANCHORED`)

                        });
                    }

                    //Quando o agente determinar que tipo de anchor é a connexão IN anchor or OUT anchor
                    if( chunkLine.type.includes( Event.AIO ) ){
                        let opts = chunkLine.as.AIO;
                        opts.anchors.forEach( anchorId => {
                            let anchorConnection = root.connections[ anchorId ];
                            connection.slots[ opts.slot ].push( anchorConnection );
                            connection.notify( Event.AIO );
                            anchorConnection.socket.on( "close", ()=>{
                                let index = connection.slots[ opts.slot ].findIndex( value1 => value1.id === anchorId );
                                if( index !== -1 ) connection.slots[ opts.slot ].splice( index, 1 );
                            });
                        });

                        console.log( `[ANCHORAIO] ${ opts.anchors.length } connection anchors registered as ${ opts.slot } slot. ANCHORS: ${ opts.anchors.join( ", ") }` );
                    }

                    chunkLine.type.forEach( value => {
                        connection.notify( value, chunkLine );
                    });
                })
            });

        }).listen( serverOpts.serverPort, () => {
            console.log( `[ANCHORAIO] Server listem on port ${ serverOpts.serverPort }`)
        } );
    }

    start();
}
