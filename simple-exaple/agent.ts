import "./init"
import {apps, hosts, identifier} from "./maps";
import * as net from "net";
import {Server} from "net";
import {
    asLine,
    ChunkLine,
    Event,
    DEFAULT_SHARE,
    eventCode, headerMap,
    SlotName,
    SocketConnection,
    writeInSocket
} from "./share";

const configs = {
    identifier: identifier,
    serverHost: DEFAULT_SHARE.SERVER_HOST,
    serverPort: DEFAULT_SHARE.SERVER_PORT,
    anchorPort: DEFAULT_SHARE.SERVER_ANCHOR_PORT,
    clientPort: DEFAULT_SHARE.AGENT_PORT,
    timeout: 1000*5,
    hosts: hosts,
    apps: apps,
    maximumSlots:20
}


export function registerConnection<T>(socket:net.Socket, namespace:"agent"|"anchor"|"req", collector?:{ [p:string]:AgentConnection }, metadata?:T, ):Promise<AgentConnection>{
    if( !metadata ) metadata = {} as any;
    return new Promise( (resolve) => {
        socket.once( "data", data => {
            const _data = JSON.parse( data.toString());
            let id = _data.id;
            let _status = {
                connected: true
            };
            socket.on( "close", hadError =>{
                console.log( "error in namespace:", namespace );
                console.error( hadError );
                _status.connected = false
            } );
            socket.on( "connect", () => _status.connected = true );
            let connection:SocketConnection&T = Object.assign(socket, metadata, {
                id,
                get connected(){ return _status.connected;}
            });

            let result:AgentConnection = {
                id: id,
                socket: connection,
                anchor( req){
                    if( req ){
                        req.pipe( socket );
                        socket.pipe( req );
                    }
                }
            }

            if( collector ){
                collector[ id ] = result;
                socket.on( "close", hadError => {
                    console.log( "error in namespace:", namespace );
                    console.error( hadError );
                    delete collector[ id ];
                });
            }
            resolve( result )
        });
    })
}

export const agent:{
    local?:Server,
    server?: net.Socket,
    anchors:{[p:string]: AgentConnection },
    id?: string,
    identifier:string,
    slots:{ [p in SlotName ]:AgentConnection[]}
    inCreate:SlotName[]
} = { anchors:{}, identifier: configs.identifier, slots:{ [SlotName.IN]:[], [SlotName.OUT]:[]}, inCreate:[] }


function createApp( application ){
    const app = configs.apps[ application ]
    let connection :net.Socket;
    if( app ){
        console.log("create app connection")
        connection = net.createConnection({
            host: app.address,
            port: app.port
        });
        connection.on( "error", err => console.log( "server:error", err.message ));
    } else if(Number.isSafeInteger( Number( application )) ) {
        console.log("create local connection")
        connection = net.createConnection({
            host: "127.0.0.1",
            port: Number( application )
        });
        connection.on( "error", err => console.log( "server:error", err.message ));
    }
    return connection;
}

function connect(){
    return new Promise((resolve) => {

        agent.server = net.createConnection({
            host: configs.serverHost,
            port: configs.serverPort
        });

        agent.server.on("connect", () => {
            registerConnection( agent.server, "agent" ).then(value => {
                agent.id = value.id;
                writeInSocket( agent.server, headerMap.SERVER({
                    origin: configs.identifier,
                    server: configs.identifier,
                    id: value.id
                }));
                createSlots( SlotName.IN ).then();
                createSlots( SlotName.OUT ).then();
                resolve( true );
            });
        });

        agent.server.on( "error", err => {
            console.log( "error in default connection" );
            console.error( err );
            setTimeout( ()=>{
                agent.server.connect( configs.serverPort );
            }, configs.timeout )
        });


        agent.server.on( "data", data => {
            asLine( data ).forEach( (chunkLine) => {
                onAgentNextLine( chunkLine );
            });
        })
    })
}

function onAgentNextLine( chunkLine:ChunkLine ){
    chunkLine.show();

    if( chunkLine.type.includes( Event.ANCHOR ) ) {
        const application = chunkLine.header["application"];
        const anchor_to = chunkLine.header["anchor_to"];

        nextSlot( SlotName.IN, anchor_to ).then( anchor => {
            let appResponse:net.Socket = createApp( application );
            if( appResponse ){
                appResponse.pipe( anchor.socket );
                anchor.socket.pipe( appResponse );
            } else {
                anchor.socket.end();
            }
            if( agent.slots[SlotName.IN].length < configs.maximumSlots/3 ) createSlots( SlotName.IN ).then();
        })
    }
    if( chunkLine.type.includes( Event.AIO ) ){
        let slot = chunkLine.header[ "slot" ];
        let slotCode = chunkLine.header[ "slotCode" ];
        createSlots( slot, {
            slotCode
        }).catch( reason => {
            console.log( "rejected on create slot", slot );
            console.error( reason )
        })
    }
}

export type CreatSlotOpts = { query?:number, slotCode?:string };

function createSlots( slotName:SlotName, opts?:CreatSlotOpts ):Promise<boolean>{
    if ( !opts ) opts = {};

    if( agent.inCreate.includes( slotName ) ) return Promise.resolve( false );
    agent.inCreate.push( slotName );

    return new Promise((resolve ) => {
        let counts = (configs.maximumSlots||1) - agent.slots[slotName].length;
        if( !opts.query ) opts.query = counts;
        let created = 0;
        if( !counts ) return resolve( false );
        let resolved:boolean = false;

        for ( let i = 0; i< counts; i++ ) {
            const next = net.createConnection({
                host: configs.serverHost,
                port: configs.anchorPort
            });
            registerConnection( next, "anchor", agent.anchors, ).then(value => {
                agent.slots[ slotName ].push( value );
                value.socket.on( "close", ( ) => {
                    let index = agent.slots[ slotName ].findIndex( value1 => value.id === value1.id );
                    if( index !== -1 ) agent.slots[ slotName ].splice( index, 1 );
                });
                created++;
                if( created === opts.query ){
                    resolved = true;
                    resolve( true );
                } else if( created === counts && !resolved ) {
                    resolved = true;
                    resolve( true );
                }
                let events:(Event|string)[] = [ Event.AIO ];
                if( opts.slotCode ){
                    events.push( eventCode(Event.AIO, opts.slotCode ));
                }

                if( created === counts ) events.push( eventCode( Event.AIO, "END") );
                if( created === counts && opts.slotCode ) events.push( eventCode( Event.AIO, "END", opts.slotCode ) );
                writeInSocket( agent.server, headerMap.AIO({
                    slot:slotName,
                    origin:agent.identifier,
                    server:agent.identifier,
                    agent: agent.identifier,
                    anchor: value.id,
                    slotCode: opts.slotCode,
                    id: value.id,
                }, ...events ));
                if( created == counts ){
                    let index = agent.inCreate.findIndex( value1 => value1 === slotName );
                    while ( index != -1 ){
                        agent.inCreate.splice( index, 1 );
                        index = agent.inCreate.findIndex( value1 => value1 === slotName );
                    }
                }
            });
        }
    })
}

export type AgentConnection = {
    id: string,
    socket:SocketConnection,
    busy?:boolean
    anchor( socket:net.Socket ),
}

export function nextSlot( slotName:SlotName, anchorId?:string ):Promise<AgentConnection>{

    if( anchorId ){
        let index = agent.slots[slotName].findIndex( value => value.id === anchorId );
        let next = agent.slots[ slotName ][ index ];
        agent.slots[ slotName ].splice( index, 1 );
        return Promise.resolve( next );
    }

    return new Promise( (resolve) => {
        let next:AgentConnection;
        let _resolve = () =>{
            if( !next ) return false;
            if( next.busy ) return false;
            if( !next.socket.connected ) return false;
            next.busy = true;
            resolve( next );
            return  true;
        }


        while ( !next && agent.slots[slotName].length ){
            next = agent.slots[slotName].shift();
            if( next.busy ) next = null;
        }

        if( _resolve() ) return;
        return createSlots( slotName ).then( created => {
            if( created ) next = agent.slots[ slotName ].shift();
            if( _resolve() ) return;
            else nextSlot( slotName, anchorId ).then( value => {
                next = value;
                _resolve()
            });
        })
    });
}



function start(){
    agent.local = net.createServer(req => {
        console.log( "new anchor request" );
        req.on( "error", err =>{
            console.log( "req:error" )
            console.error( err );
        })
        req.on( "close", () => {
            console.log( "req:close");
        })

        const remoteAddressParts = req.address()["address"].split( ":" );
        const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
        const host = configs.hosts[ address ];

        if( !host ) return req.end( () => { console.log( "Cansel connection with", remoteAddressParts )});

        console.log( "out slots: ", agent.slots[SlotName.OUT].length );
        console.log( "in  slots: ", agent.slots[SlotName.IN].length );
        nextSlot( SlotName.OUT ).then(value => {
            if( !value ) {
                console.trace();
                throw new Error( "NoSlot");
            }
            if( !value ) return req.end();
            writeInSocket( agent.server, headerMap.ANCHOR({
                origin: configs.identifier,
                server: host.server,
                application: host.application,
                anchor_form: value.id
            }));
            value.anchor( req );

            if( agent.slots[SlotName.OUT].length < configs.maximumSlots/3 ) createSlots( SlotName.OUT ).then();
        }).catch( reason => console.error( reason))
    }).listen( configs.clientPort, ()=>{});
}

connect().then(start);





