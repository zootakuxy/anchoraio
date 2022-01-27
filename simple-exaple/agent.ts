import "./init"
import * as net from "net";
import {Server} from "net";
import {
    asLine,
    ChunkLine,
    Event,
    DEFAULT_SHARE,
    eventCode, headerMap,
    SocketConnection,
    writeInSocket
} from "./share";
import {SlotManager, SlotName} from "./slot";
import {startDNSServer} from "./dns/server";
import {aioResolve, asAio} from "./dns/aio.resolve";
import {apps, createApp} from "./apps";
import chalk from "chalk";

export const serverHost = process.argv[2];
export const identifier = asAio( process.argv[3] ).identifier;

export function registerConnection<T>(socket:net.Socket, namespace:"agent"|"anchor"|"req", collector?:{ [p:string]:AgentConnection }, metadata?:T, ):Promise<AgentConnection>{
    if( !metadata ) metadata = {} as any;
    return new Promise( (resolve) => {
        socket.once( "data", data => {
            const _data = JSON.parse( data.toString());
            let id = _data.id;
            let _status = { connected: true };
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
            if( !!collector ) collector[ id ] = result;
            socket.on( "close", hadError => {
                _status.connected = false
                if( collector ) delete collector[ id ];
            })
            resolve( result )
        });
    })
}

const agentConfigs = {
    identifier: identifier,
    serverHost: serverHost,
    serverPort: DEFAULT_SHARE.SERVER_PORT,
    anchorPort: DEFAULT_SHARE.SERVER_ANCHOR_PORT,
    agentPort: DEFAULT_SHARE.AGENT_PORT,
    timeout: 1000*5,
    maximumSlots:20
}

export const agent:{
    local?:Server,
    server?: net.Socket,
    anchors:{[p:string]: AgentConnection },
    id?: string,
    identifier:string,
    slots:{ [p in SlotName ]:AgentConnection[]}
    inCreate:SlotName[],
} = { anchors:{}, identifier: agentConfigs.identifier, slots:{ [SlotName.IN]:[], [SlotName.OUT]:[]}, inCreate:[] }


function connect(){
    return new Promise((resolve) => {

        agent.server = net.createConnection({
            host: agentConfigs.serverHost,
            port: agentConfigs.serverPort
        });

        agent.server.on("connect", () => {
            registerConnection( agent.server, "agent" ).then(value => {
                agent.id = value.id;
                writeInSocket( agent.server, headerMap.SERVER({
                    origin: agentConfigs.identifier,
                    server: agentConfigs.identifier,
                    id: value.id
                }));
                createSlots( SlotName.IN ).then();
                createSlots( SlotName.OUT ).then();
                resolve( true );
            });
        });

        agent.server.on( "error", err => {
            console.error( err );
            setTimeout( ()=>{
                agent.server.connect( agentConfigs.serverPort );
            }, agentConfigs.timeout )
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


        slotManager.nextSlot( SlotName.IN, anchor_to ).then( anchor => {
            let appResponse:net.Socket = createApp( application );

            if( appResponse ){
                appResponse.pipe( anchor.socket );
                anchor.socket.pipe( appResponse );
            } else {
                anchor.socket.end();
            }
            if( agent.slots[SlotName.IN].length < agentConfigs.maximumSlots/3 ) createSlots( SlotName.IN ).then();
        })
    }
    if( chunkLine.type.includes( Event.AIO ) ){
        let slot = chunkLine.header[ "slot" ];
        let slotCode = chunkLine.header[ "slotCode" ];
        createSlots( slot, {
            slotCode
        }).catch( reason => {
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
        let counts = (agentConfigs.maximumSlots||1) - agent.slots[slotName].length;
        if( !opts.query ) opts.query = counts;
        let created = 0;
        if( !counts ) return resolve( false );
        let resolved:boolean = false;

        for ( let i = 0; i< counts; i++ ) {
            const next = net.createConnection({
                host: agentConfigs.serverHost,
                port: agentConfigs.anchorPort
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

let slotManager = new SlotManager<AgentConnection>({
    slots(){ return agent.slots },
    handlerCreator( name, anchorID, opts, ...extras){
        return createSlots( name, opts );
    }
})

function startAgentServer(){
    agent.local = net.createServer(req => {

        req.on( "error", err =>{
            console.error( err );
        })
        req.on( "close", () => {
        })

        const remoteAddressParts = req.address()["address"].split( ":" );
        const address =  remoteAddressParts[ remoteAddressParts.length-1 ];


        let server = aioResolve.serverName( address );
        if( !server ) return req.end( () => { });
        let agentServer = aioResolve.agents.agents[ server.agent ];

        slotManager.nextSlot( SlotName.OUT ).then(value => {
            if( !value ) return req.end();
            writeInSocket( agent.server, headerMap.ANCHOR({
                origin: agentConfigs.identifier,
                server: agentServer.identifier,
                application: server.application,
                domainName: server.domainName,
                port: agentConfigs.agentPort,
                anchor_form: value.id
            }));
            value.anchor( req );

            if( agent.slots[SlotName.OUT].length < agentConfigs.maximumSlots/3 ) createSlots( SlotName.OUT ).then();
        }).catch( reason => console.error( reason))
    }).listen( agentConfigs.agentPort, ()=>{
        console.log( chalk.greenBright`AGENT SERVER [ON]` )
    });
}

startDNSServer();
connect().then( value => {
    console.log( chalk.greenBright`AGENT CONNECTED [ON]` );
    startAgentServer();
});





