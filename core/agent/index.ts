import "../global/init"
import * as net from "net";
import {Server} from "net";
import {
    asLine,
    ChunkLine,
    Event,
    eventCode, headerMap,
    SocketConnection,
    writeInSocket
} from "../global/share";
import {SlotManager, SlotName} from "../global/slot";
import {aioResolve } from "../dns/aio.resolve";
import { createApp} from "./apps";
import chalk from "chalk";
import {startDNSServer} from "../dns";
import {AgentOpts} from "./opts";

export default function ( agentOpts:AgentOpts ){

    function registerConnection<T>(socket:net.Socket, namespace:"agent"|"anchor"|"req", collector?:{ [p:string]:AgentConnection }, metadata?:T, ):Promise<AgentConnection>{
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

    const agent:{
        local?:Server,
        server?: net.Socket,
        anchors:{[p:string]: AgentConnection },
        id?: string,
        identifier:string,
        slots:{ [p in SlotName ]:AgentConnection[]}
        inCreate:SlotName[],
    } = { anchors:{}, identifier: agentOpts.identifier, slots:{ [SlotName.IN]:[], [SlotName.OUT]:[]}, inCreate:[] }


    function connect(){
        return new Promise((resolve) => {

            agent.server = net.createConnection({
                host: agentOpts.serverHost,
                port: agentOpts.serverPort
            });

            agent.server.on("connect", () => {
                registerConnection( agent.server, "agent" ).then(value => {
                    agent.id = value.id;
                    writeInSocket( agent.server, headerMap.SERVER({
                        origin: agentOpts.identifier,
                        server: agentOpts.identifier,
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
                    agent.server.connect( agentOpts.serverPort );
                }, agentOpts.reconnectTimeout )
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

            slotManager.nextSlot( SlotName.IN, chunkLine.as.ANCHOR.anchor_to ).then( anchor => {
                let appResponse:net.Socket = createApp( chunkLine.as.ANCHOR.application );

                if( appResponse ){
                    appResponse.pipe( anchor.socket );
                    anchor.socket.pipe( appResponse );
                    console.log( `[anchor application]`, chunkLine.as.ANCHOR.origin, "->", agentOpts.identifier, chunkLine.as.ANCHOR.application, "\\", chalk.greenBright( "connected" ));
                } else {
                    console.log( "[anchor application]", chunkLine.as.ANCHOR.origin, "->", agentOpts.identifier, chunkLine.as.ANCHOR.application, "\\", chalk.yellowBright( "canceled" ));
                    anchor.socket.end();
                }
                if( agent.slots[SlotName.IN].length < agentOpts.maxSlots/3 ) createSlots( SlotName.IN ).then();
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

    type CreatSlotOpts = { query?:number, slotCode?:string };

    function createSlots( slotName:SlotName, opts?:CreatSlotOpts ):Promise<boolean>{
        if ( !opts ) opts = {};

        if( agent.inCreate.includes( slotName ) ) return Promise.resolve( false );
        agent.inCreate.push( slotName );

        return new Promise((resolve ) => {
            let counts = (agentOpts.maxSlots||1) - agent.slots[slotName].length;
            if( !opts.query ) opts.query = counts;
            let created = 0;
            if( !counts ) return resolve( false );
            let resolved:boolean = false;

            for ( let i = 0; i< counts; i++ ) {
                const next = net.createConnection({
                    host: agentOpts.serverHost,
                    port: agentOpts.anchorPort
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

    type AgentConnection = {
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
                if( !value ){
                    console.log( "[anchor request]", agentServer.identifier, server.application, "\\", chalk.redBright("rejected"));
                    return req.end();
                }
                writeInSocket( agent.server, headerMap.ANCHOR({
                    origin: agentOpts.identifier,
                    server: agentServer.identifier,
                    application: server.application,
                    domainName: server.domainName,
                    port: agentOpts.agentPort,
                    anchor_form: value.id
                }));
                value.anchor( req );

                if( agent.slots[SlotName.OUT].length < agentOpts.maxSlots/3 ) createSlots( SlotName.OUT ).then();
                console.log( "[anchor request]", agentServer.identifier, server.application, "\\", chalk.blueBright( "accepted" ));
            }).catch( reason => console.error( reason))
        }).listen( agentOpts.agentPort, ()=>{
            console.log( chalk.greenBright`AGENT SERVER [ON]` )
        });
    }

    startDNSServer( agentOpts );
    connect().then( value => {
        console.log( chalk.greenBright`AGENT CONNECTED [ON]` );
        startAgentServer();
    });
}




