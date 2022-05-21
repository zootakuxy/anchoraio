import "../global/init"
import * as net from "net";
import {Server} from "net";
import {
    asLine,
    ChunkLine, Emitter,
    Event,
    eventCode, headerMap,
    SocketConnection,
    writeInSocket
} from "../global/share";
import {SlotManager, SlotType} from "../global/slot";
import {aioResolve } from "../dns/aio.resolve";
import { createConnection} from "./apps";
import chalk from "chalk";
import {AgentOpts} from "./opts";

type CreatSlotOpts = { query?:number, slotCode?:string };

type AgentConnection = {
    id: string,
    socket:SocketConnection,
    req?:net.Socket,
    busy?:boolean
    anchor( socket:net.Socket ),
}

type AuthStatus = "unknown"|"accepted"|"rejected";

export interface Agent {
    /** Status of connection with server*/
    isConnected:boolean

    isAvailable:boolean

    /**  */
    local?:Server,

    /** Socket instance of server */
    server?: net.Socket,

    authStatus: AuthStatus

    /**  */
    anchors:{[p:string]: AgentConnection },

    /** Currente connection identifier (this value can be change on reconnection) */
    id?: string,

    /** Identifier or domain of this agent */
    identifier:string,

    /**  */
    slots:{ [p in SlotType ]:AgentConnection[]}
    /**  */
    inCreate:SlotType[],
}

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
                        this.req = req;
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

    const agent:Agent = {
        anchors:{}, identifier: agentOpts.identifier, slots:{ [SlotType.IN ]:[], [SlotType.OUT]:[]}, inCreate:[],
        authStatus: "unknown",
        get isConnected(){
            return this.server["connected"]
        }, get isAvailable( ){
            return this.isConnected && this.authStatus === "accepted";
        }
    }

    function connect(){
        return new Promise((resolve) => {
            agent.server = net.createConnection({
                host: agentOpts.serverHost,
                port: agentOpts.serverPort
            });

            agent.server.on("connect", () => {
                agent.server["connected"] = true;
                registerConnection( agent.server, "agent" ).then( value => {
                    agent.id = value.id;
                    writeInSocket( agent.server, headerMap.SERVER({
                        origin: agentOpts.identifier,
                        server: agentOpts.identifier,
                        id: value.id
                    }));
                    resolve( true );
                });
            });

            agent.server.on( "error", err => {
                console.error( err );
                agent.server["connected"] = false;
                agent.id = null;

                if( agent.authStatus === "rejected" ) {
                    return;
                }

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
            slotManager.nextSlot( SlotType.IN, chunkLine.as.ANCHOR.anchor_to ).then(anchor => {
                let appResponse:net.Socket = createConnection( chunkLine.as.ANCHOR.application );

                if( appResponse ){
                    appResponse.pipe( anchor.socket );
                    anchor.socket.pipe( appResponse );
                    console.log( `[ANCHORAIO] Agent>`, chalk.blueBright( `Anchor form ${ chunkLine.as.ANCHOR.origin} to application ${ chunkLine.as.ANCHOR.application } \\CONNECTED!` ));
                } else {
                    console.log( `[ANCHORAIO] Agent>`, chalk.redBright( `Anchor form ${ chunkLine.as.ANCHOR.origin} to application ${ chunkLine.as.ANCHOR.application } \\CANSELED!` ));
                    anchor.socket.end();
                }
                if( agent.slots[SlotType.IN].length < agentOpts.minSlots ) createSlots( SlotType.IN ).then();
            })

        }

        if( chunkLine.type.includes( Event.CANSEL ) ){
            let anchorForm = chunkLine.header["anchor_form"];
            let connection = agent.anchors[ anchorForm ];
            connection.socket.end();
            connection.req.end();
            console.log( "[ANCHORAIO] Agent>", chalk.redBright( "Anchor faild!"))
        }

        if( chunkLine.type.includes( Event.REJECTED ) ){
            agent.authStatus = "rejected";
            agent.id = null;
            agent.server["connected"] = false;
            agent.server.end();
            console.log( "[ANCHORAIO] Agent>", chalk.redBright( "Auth failed with server!"))
        }

        if( chunkLine.type.includes( Event.ACCEPTED ) ){
            agent.authStatus = "accepted";
            createSlots( SlotType.IN ).then();
            createSlots( SlotType.OUT ).then();
            console.log( "[ANCHORAIO] Agent>", chalk.greenBright( "Auth success with server!"))
        }

        if( chunkLine.type.includes( Event.AIO ) ){
            let slot = chunkLine.header[ "slot" ];
            let slotCode = chunkLine.header[ "slotCode" ];
            createSlots( slot, {
                slotCode
            }).catch( reason => {
                console.error( reason )
            });
            console.log( "[ANCHORAIO] Agent>", chalk.blueBright( "Serve need more anchor slots!"))
        }
    }

    function createSlots(slotType:SlotType, opts?:CreatSlotOpts ):Promise<boolean>{
        if ( !opts ) opts = {};

        if( agent.inCreate.includes( slotType ) ) return Promise.resolve( false );
        agent.inCreate.push( slotType );

        return new Promise((resolve ) => {
            let counts = (agentOpts.maxSlots||1) - agent.slots[slotType].length;
            if( !opts.query ) opts.query = counts;
            let created = 0;
            if( !counts ) return resolve( false );
            let resolved:boolean = false;

            let _anchors:string[] = [];
            for ( let i = 0; i< counts; i++ ) {
                const next = net.createConnection({
                    host: agentOpts.serverHost,
                    port: agentOpts.anchorPort
                });
                registerConnection( next, "anchor", agent.anchors, ).then(connection => {
                    agent.slots[ slotType ].push( connection );
                    connection.socket.on( "close", ( ) => {
                        let index = agent.slots[ slotType ].findIndex( value1 => connection.id === value1.id );
                        if( index !== -1 ) agent.slots[ slotType ].splice( index, 1 );
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

                    _anchors.push( connection.id );

                    if( created == counts ){
                        writeInSocket( agent.server, headerMap.AIO({
                            slot:slotType,
                            origin:agent.identifier,
                            server:agent.identifier,
                            agent: agent.identifier,
                            anchors: _anchors,
                            slotCode: opts.slotCode,
                            id: connection.id,
                        }, ...events ));

                        let index = agent.inCreate.findIndex( value1 => value1 === slotType );
                        while ( index != -1 ){
                            agent.inCreate.splice( index, 1 );
                            index = agent.inCreate.findIndex( value1 => value1 === slotType );
                        }
                    }
                });
            }
        })
    }


    let slotManager = new SlotManager<AgentConnection>({
        slots(){ return agent.slots },
        handlerCreator( name, anchorID, opts, ...extras){
            return createSlots( name, opts );
        }
    })

    function startAgentServer(){
        agent.local = net.createServer(req => {
            if( !agent.isAvailable ) return req.end( () => {
                let status = "";
                if( ! agent.isConnected ) status = "disconnected";
                if( agent.authStatus !== "accepted" ) status+= ` ${agent.authStatus}`;

                console.log( "[ANCHORAIO] Agente>", chalk.redBright( `Request canceled because agent is offline: ${status.trim()}!`))
            });

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
            if( !agentServer ) return req.end( () => { });

            slotManager.nextSlot( SlotType.OUT ).then(connection => {
                if( !connection ){
                    console.log( "[ANCHORAIO] Request>", agentServer.identifier, server.application, "\\", chalk.redBright("rejected"));
                    return req.end();
                }
                writeInSocket( agent.server, headerMap.ANCHOR({
                    origin: agentOpts.identifier,
                    server: agentServer.identifier,
                    application: server.application,
                    domainName: server.domainName,
                    port: agentOpts.agentPort,
                    anchor_form: connection.id
                }));
                connection.anchor( req );

                if( agent.slots[SlotType.OUT].length < agentOpts.minSlots ) createSlots( SlotType.OUT ).then();
                console.log( "[ANCHORAIO] Request>", agentServer.identifier, server.application, "\\", chalk.blueBright( "accepted" ));
            }).catch( reason => console.error( reason))
        }).listen( agentOpts.agentPort, ()=>{
            console.log( "[ANCHORAIO] Agent>", chalk.greenBright(`Running Agent ${ agentOpts.identifier } on port ${ agentOpts.agentPort }`) )
        });
    }

    if( agentOpts.selfServer ){
        agentOpts.serverHost = "127.0.0.1"
        require('../server' ).default( agentOpts );
    }

    connect().then( value => {
        console.log( "[ANCHORAIO] Agent>", chalk.greenBright( `Connected to server on ${agentOpts.serverHost}:${String( agentOpts.serverPort )}` ) );
        startAgentServer();
    });

    if( !agentOpts.noDNS ) require( "../dns/server" ).startDNS( agentOpts );
    if( !agentOpts.noAPI ) require( "../dns/api" ).startAPI( agentOpts, agent );
}







