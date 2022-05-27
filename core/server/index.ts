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
    auth:boolean
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

interface ServerChanel {
    id:string,
    referer:string,
    server:string,
    origin:string
    status: "busy"|"free",
    requests:number
}

export const root: {
    _last?:number
    connections:{[p:string]:ServerConnection},
    servers:{[p:string]:string},
    req:{[p:string]:string},
    next:number,
    chanel:{[p:string]:ServerChanel[]}
} = {
    connections: {},
    _last:0,
    req: {},
    servers:{},
    chanel:{},
    get next(){
    this._last = this._last || 0;
    return ++this._last;
}}


type EventName = string|Event;


export default function ( serverOpts:ServerOptions  ){
    let connectionCounts = 0;
    function createConnectionId ( socket:net.Socket, namespace, metadata?:{[p:string|number]:any} ):ServerConnection{
        let id = `${namespace}://${nanoid( 12 )}/${ connectionCounts++ }`;
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
            auth: false,
            id: id,
            socket: Object.assign(  socket, metadata||{}, {
                id: id,
                get connected(){ return _status.connected }
            }),
            keys: [],
            slots:{ [SlotType.ANCHOR_OUT]:[], [SlotType.ANCHOR_IN]:[] },
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
    let slotCount =0;
    function requireSlot(slotName:SlotType, connection:ServerConnection ):Promise<boolean>{
        return new Promise<boolean>( (resolve ) => {
            let slotCode = `${nanoid( 8 )}/${slotCount++}`;
             writeInSocket( connection.socket, {
                 type: Event.SLOTS,
                 slot:slotName,
                 slotCode
            });
            connection.once( eventCode( Event.SLOTS, slotCode ),()=>{
                return resolve( !!connection.slots[slotName].length );
            })
        })
    }

    const serverSlotManager = new SlotManager<ServerConnection>({
        slots( server:ServerConnection){
            return server?.slots
        },
        handlerCreator(slotName:SlotType, anchorID:string, server:ServerConnection, ...opts ){
            return requireSlot(  slotName, server )
        }
    })

    function start(){
        net.createServer( socket => {
            createConnectionId( socket, "anchor" );
        }).listen( serverOpts.anchorPort, ()=>{
            console.log( `[ANCHORIO] Server anchor port liste on  ${ serverOpts.anchorPort }`)
        } );

        net.createServer(function( socket) {
            const connection =  createConnectionId( socket, "server" );

            socket.on( "data", data => {

                asLine( data ).forEach( async chunkLine => {
                    chunkLine.show();

                    //Quando o agent identifica-se no servidor
                    if( chunkLine.type.includes( Event.AUTH ) ){

                        let opts = chunkLine.as.AUTH;

                        let _id = root.servers[ opts.server ];
                        let _server = root.connections[ _id ];
                        if( _id && _server && _server.socket.connected ){
                            console.log( "[ANCHORIO] Server>", chalk.redBright( `Already exists another agent for ${ opts.server }. CONNECTION REJECTED!`));
                            writeInSocket( socket, headerMap.AUTH_REJECTED( opts ));
                            return;
                        }

                        const  connection = root.connections[ opts.id ];
                        connection.keys.push( opts.id, opts.server );
                        root.servers[ opts.server ] = opts.id;
                        console.log( "[ANCHORIO] Server>", chalk.greenBright( `Agent ${ opts.server } connected with id ${ opts.id } `));

                        connection.auth = true;
                        writeInSocket( connection.socket, headerMap.AUTH_ACCEPTED( opts ));

                        connection.socket.on( "close", ( err) => {
                            if( root.servers[ opts.server ] === opts.id ) delete root.servers[ opts.server ];
                            let chanelList = root.chanel[ opts.server ];
                            chanelList.filter( chanel => chanel.referer === connection.id ).forEach( chanel => {
                                let index = chanelList.indexOf( chanel );
                                if( index === -1 ) return;
                                chanelList.splice( index, 1 );
                            });
                        });

                    }

                    if( chunkLine.type.includes( Event.AUTH_CHANEL ) ){

                        let referer = chunkLine.as.AUTH_CHANEL.referer;
                        let server = chunkLine.as.AUTH_CHANEL.server;
                        if( !root.servers[ server ] || root.servers[ server ] !== referer ){
                            console.log( "[ANCHORIO] Server>", chalk.redBright( `Channel auth rejected`));
                            connection.socket.end();
                            return;
                        }

                        let chanel:ServerChanel = {
                            id: chunkLine.as.AUTH_CHANEL.id,
                            origin: chunkLine.as.AUTH_CHANEL.origin,
                            server: chunkLine.as.AUTH_CHANEL.server,
                            referer: chunkLine.as.AUTH_CHANEL.referer,
                            status: "free",
                            requests: 0
                        }

                        if( !root.chanel[ server ] ) root.chanel[ server ] = [];
                        root.chanel[ server ].push( chanel );

                        root.connections[ connection.id ] = new Proxy( connection, {
                            get(target: ServerConnection, p: string | symbol, receiver: any): any {
                                if( p === "socket" ) return target.socket;
                                return  root.connections[ referer ][ p ];
                            }
                        })

                        socket.on( "close", hadError => {
                            let index = root.chanel[ server ].indexOf( chanel );
                            root.chanel[ server ].splice( index, 1 );
                        });
                        connection.auth = true;
                        console.log( "[ANCHORIO] Server>", chalk.blueBright( `Channel ${  chanel.id } authenticated refer ${ chanel.server }!`));

                    }

                    if( chunkLine.type.includes( Event.CHANEL_FREE ) ){
                        if( !connection.auth ) return;
                        let opts = chunkLine.as.AUTH_CHANEL;
                        let chanel = root.chanel[ opts.server ].find( chanel => chanel.id === opts.id );
                        chanel.requests--;
                        if( chanel.requests < 1 ) chanel.status = "free";
                    }

                    //Quando o agente solicita uma nova anchora
                    if(  chunkLine.type.includes( Event.AIO ) ){
                        if( !connection.auth ) return;
                        let opts = chunkLine.as.AIO;
                        let serverResolve = root.connections[ root.servers[ opts.server ] ];
                        if( !serverResolve ) {
                            console.log( "[ANCHORIO] Server>", chalk.redBright `Anchor of request ${ chunkLine.as.AIO.request } from ${ chunkLine.header.anchor_form } to ${ chunkLine.header.server } ${chalk.redBright( "CANCELLED!")}`)
                            return writeInSocket( connection.socket, headerMap.AIO_CANSEL( Object.assign(opts )))
                        }

                        let chanel = root.chanel[ opts.server ].find( chanel => chanel.status === "free" );
                        if( !chanel ){
                            chanel = root.chanel[ opts.server ].shift();
                            root.chanel[ opts.server ].push( chanel );
                        }

                        chanel.status = "busy";
                        chanel.requests++;

                        let serverResolverConnection = root.connections[ chanel.id ];

                        let slotIN = serverSlotManager.nextSlot( SlotType.ANCHOR_OUT, opts.anchor_form, connection );
                        let slotOUT = serverSlotManager.nextSlot( SlotType.ANCHOR_IN, null, serverResolverConnection )

                        Promise.all([
                            slotIN,
                            slotOUT
                        ]).then( value => {
                            const [ anchorOUT, anchorIN ] = value;
                            anchorOUT.anchor( anchorIN );


                            writeInSocket( serverResolverConnection.socket, headerMap.AIO(Object.assign( opts, {
                                anchor_to: anchorIN.id,
                            })));

                            writeInSocket( connection.socket, headerMap.AIO_SEND( opts ) );
                            console.log( "[ANCHORIO] Server>",  `Anchor of request ${ chunkLine.as.AIO.request } from ${ chunkLine.header.anchor_form } to ${ chunkLine.header.server } ${ chalk.greenBright( "AIO'K" )}`)
                        });
                    }

                    //Quando o agente determinar que tipo de anchor é a connexão IN anchor or OUT anchor
                    if( chunkLine.type.includes( Event.SLOTS ) ){
                        if( !connection.auth ) return ;
                        let opts = chunkLine.as.SLOTS;
                        opts.anchors.forEach( anchorId => {
                            let anchorConnection = root.connections[ anchorId ];
                            anchorConnection.auth = true;

                            connection.slots[ opts.slot ].push( anchorConnection );
                            connection.notify( Event.SLOTS );
                            anchorConnection.socket.on( "close", ()=>{
                                let index = connection.slots[ opts.slot ].findIndex( value1 => value1.id === anchorId );
                                if( index !== -1 ) connection.slots[ opts.slot ].splice( index, 1 );
                            });
                        });

                        console.log( `[ANCHORIO] ${ opts.anchors.length } connection anchors registered as ${ opts.slot } slot.` );
                    }

                    chunkLine.type.forEach( value => {
                        connection.notify( value, chunkLine );
                    });
                })
            });

        }).listen( serverOpts.serverPort, () => {
            console.log( `[ANCHORIO] Server listem on port ${ serverOpts.serverPort }`)
        } );
    }

    start();
}
