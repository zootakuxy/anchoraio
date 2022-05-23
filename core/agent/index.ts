import "../global/init"
import * as net from "net";
import {Server} from "net";
import {asLine, ChunkLine, Event, eventCode, headerMap, SocketConnection, writeInSocket} from "../global/share";
import {SlotManager, SlotType} from "../global/slot";
import {AgentServer, AioAnswerer, aioResolve} from "../dns/aio.resolve";
import {createConnection} from "./apps";
import chalk from "chalk";
import {AgentOpts} from "./opts";
import {nanoid} from "nanoid";
import detectPort from "detect-port";

type CreatSlotOpts = { query?:number, slotCode?:string };

type AgentConnection = {
    id: string,
    socket:SocketConnection,
    req?:net.Socket,
    busy?:boolean
    anchor( socket:net.Socket ),
}

type AuthStatus = "unknown"|"accepted"|"rejected";

interface AgentRequest {
    id?:string
    status?:"pendent"|"income"|"complete"
    socket:net.Socket,
    agentServer:AgentServer
    aioAnswerer: AioAnswerer
}


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
    identifier?:string,

    /**  */
    slots:{ [p in SlotType ]:AgentConnection[]}
    /**  */
    inCreate:SlotType[],

    requests:AgentRequest[],
}

export const agent = new( class AgentImplement implements Agent{
    anchors:{}
    slots:{ [SlotType.IN ]: AgentConnection[], [SlotType.OUT]:  AgentConnection[]} = { [SlotType.IN]:[], [SlotType.OUT]:[]}
    inCreate: SlotType[] = [];
    authStatus:AuthStatus = "unknown"
    requests: AgentRequest[] = [];
    identifier:string
    id:string
    server:net.Socket
    local:Server
    private slotManager:SlotManager<AgentConnection>
    private requestCount:number = 0;
    private _opts:AgentOpts;

    agentPorts:number[] = [];

    constructor() {
        this.slotManager = new SlotManager<AgentConnection>({
            slots(){ return agent.slots },
            handlerCreator( name, anchorID, opts, ...extras){
                return this.createSlots( name, opts );
            }
        });
    }

    set opts( opts){
        this._opts = opts;
        this.identifier = opts.identifier;
    }

    get opts(){ return this._opts }

    get isConnected(){
        return this.server["connected"]
    } get isAvailable( ){
        return this.isConnected && this.authStatus === "accepted";
    } createServer( ){
        return new Promise(async (resolve, reject) => {
            let nextPort;
            if( !this.agentPorts.includes( this.opts.agentPort ) ) nextPort = this.opts.agentPort;
            else nextPort = await detectPort( this.opts.agentPort +100 );

            let serverListen = net.createServer(req => {

                if( !agent.isAvailable ) return req.end( () => {
                    let status = "";
                    if( ! agent.isConnected ) status = "disconnected";
                    if( agent.authStatus !== "accepted" ) status+= ` ${agent.authStatus}`;
                    console.log( "[ANCHORAIO] Agente>", chalk.redBright( `Request canceled because agent is offline: ${status.trim()}!`))
                });
                let requestId = `${agent.identifier}://${nanoid( 12 )}/${ this.requestCount++}`;
                console.log( "[ANCHORAIO] Agent>", `Request ${ requestId } received` );


                req.on( "error", err =>{ console.log( "[ANCHORAIO] Agent>", `Request socket error ${err.message}` ); })
                req.on( "close", () => { })

                const remoteAddressParts = req.address()["address"].split( ":" );
                const address =  remoteAddressParts[ remoteAddressParts.length-1 ];


                let aioAnswerer = aioResolve.serverName( address );
                if( !aioAnswerer ) return req.end( () => { });
                let agentServer = aioResolve.agents.agents[ aioAnswerer.agent ];
                if( !agentServer ) return req.end( () => { });
                this.nextRequest( { agentServer: agentServer, socket: req, aioAnswerer: aioAnswerer, id: requestId } )

            }).listen( nextPort, ()=>{
                console.log( "[ANCHORAIO] Agent>", chalk.greenBright(`Running Agent ${ this.identifier } on port ${ nextPort }`) );
                resolve( nextPort );
                this.agentPorts.push( nextPort );
                if( nextPort === this.opts.agentPort ) this.local = serverListen;
            });

        })

    } private nextRequest( request:AgentRequest ){
        request.status = "pendent";
        this.requests.push( request );
        if( this.requests.length === 1 ) this.nextAnchor();

    } protected nextAnchor(){
        if( !agent.requests.length ) return;
        let next = agent.requests.find( value => value.status === "pendent" );
        next.status = "income";
        let agentServer = next.agentServer;
        let req = next.socket;
        let aioAnswerer = next.aioAnswerer;

        console.log( "[ANCHORAIO] Agent>", `Anchor request ${ next.id} started!`)

        this.slotManager.nextSlot( SlotType.OUT ).then(connection => {
            if( !connection ){
                console.log( "[ANCHORAIO] Request>", agentServer.identifier, aioAnswerer.application, "\\", chalk.redBright("rejected"));
                return req.end();
            }
            writeInSocket( agent.server, headerMap.ANCHOR({
                origin: this.identifier,
                server: agentServer.identifier,
                request: next.id,
                application: aioAnswerer.application,
                domainName: aioAnswerer.domainName,
                anchor_form: connection.id
            }));
            connection.anchor( req );

            if( agent.slots[SlotType.OUT].length < this.opts.minSlots ) this.createSlots( SlotType.OUT ).then();
            console.log( "[ANCHORAIO] Request>", agentServer.identifier, aioAnswerer.application, "\\", chalk.blueBright( "accepted" ));
        }).catch( reason => {
            // console.error(reason)
        })

    } private createSlots(slotType:SlotType, opts?:CreatSlotOpts ):Promise<boolean>{
        if ( !opts ) opts = {};

        if( this.inCreate.includes( slotType ) ) return Promise.resolve( false );
        agent.inCreate.push( slotType );

        return new Promise((resolve ) => {
            let counts = (this.opts.maxSlots||1) - agent.slots[slotType].length;
            if( !opts.query ) opts.query = counts;
            let created = 0;

            if( !counts ) return resolve( false );
            let resolved:boolean = false;

            let _anchors:string[] = [];
            for ( let i = 0; i< counts; i++ ) {
                const next = net.createConnection({
                    host: this.opts.serverHost,
                    port: this.opts.anchorPort
                });

                this.registerConnection( next, "anchor", agent.anchors, ).then(connection => {
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

    } private registerConnection<T>(socket:net.Socket, namespace:"agent"|"anchor"|"req", collector?:{ [p:string]:AgentConnection }, metadata?:T, ):Promise<AgentConnection>{
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


    } connect(){
        return new Promise((resolve) => {
            agent.server = net.createConnection({
                host: this.opts.serverHost,
                port: this.opts.serverPort
            });

            agent.server.on("connect", () => {
                agent.server["connected"] = true;
                agent.registerConnection( agent.server, "agent" ).then( value => {
                    agent.id = value.id;
                    writeInSocket( agent.server, headerMap.SERVER({
                        origin: this.identifier,
                        server: this.identifier,
                        id: value.id
                    }));
                    resolve( true );
                });
            });

            agent.server.on( "error", err => {
                if( agent.isConnected ) console.log( "[ANCHORAIO] Agent>", `Connection error ${ err.message}` );
                if( agent.isConnected && agent.authStatus !== "rejected" ) console.log( "[ANCHORAIO] Agent>", `Try reconnecting to server!` );
                agent.server["connected"] = false;
                agent.id = null;

                if( agent.authStatus === "rejected" ) return;

                setTimeout( ()=>{
                    agent.server.connect( this.opts.serverPort );
                }, this.opts.reconnectTimeout )
            });

            agent.server.on( "data", data => {
                asLine( data ).forEach( (chunkLine) => {
                    this.onAgentNextLine( chunkLine );
                });
            })
        })


    } private onAgentNextLine( chunkLine:ChunkLine ){
        chunkLine.show();

        if( chunkLine.type.includes( Event.ANCHOR ) ) {
            agent.slotManager.nextSlot( SlotType.IN, chunkLine.as.ANCHOR.anchor_to ).then(anchor => {
                let appResponse:net.Socket = createConnection( chunkLine.as.ANCHOR.application );

                if( appResponse ){
                    appResponse.pipe( anchor.socket );
                    anchor.socket.pipe( appResponse );
                    console.log( `[ANCHORAIO] Agent>`, chalk.blueBright( `Anchor form ${ chunkLine.as.ANCHOR.origin} to application ${ chunkLine.as.ANCHOR.application } \\CONNECTED!` ));
                } else {
                    console.log( `[ANCHORAIO] Agent>`, chalk.redBright( `Anchor form ${ chunkLine.as.ANCHOR.origin} to application ${ chunkLine.as.ANCHOR.application } \\CANSELED!` ));
                    anchor.socket.end();
                }
                if( agent.slots[SlotType.IN].length < this.opts.minSlots ) agent.createSlots( SlotType.IN ).then();
            })

        }

        if( chunkLine.type.includes( Event.ANCHOR_SEND )) {
            let request = chunkLine.as.ANCHOR.request;
            let index = agent.requests.findIndex( value => value.id === request );
            agent.requests[ index ].status = "complete";
            agent.requests.splice( index, 1 );
            agent.nextAnchor();
            console.log( "[ANCHORAIO] Agent>", chalk.blueBright( "Anchor send!"))
        }

        if( chunkLine.type.includes( Event.ANCHOR_CANSEL ) ){
            let anchorForm = chunkLine.header["anchor_form"];
            let connection = agent.anchors[ anchorForm ];
            connection.socket.end();
            connection.req.end();

            let request = chunkLine.as.ANCHOR.request;
            let index = agent.requests.findIndex( value => value.id === request );
            agent.requests[ index ].status = "complete";
            agent.requests.splice( index, 1 );
            this.nextAnchor();
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
            this.createSlots( SlotType.IN ).then();
            this.createSlots( SlotType.OUT ).then();
            console.log( "[ANCHORAIO] Agent>", chalk.greenBright( "Auth success with server!"))
        }

        if( chunkLine.type.includes( Event.AIO ) ){
            let slot = chunkLine.header[ "slot" ];
            let slotCode = chunkLine.header[ "slotCode" ];
            this.createSlots( slot, {
                slotCode
            }).catch( reason => {
                // console.error( reason )
            });
            console.log( "[ANCHORAIO] Agent>", chalk.blueBright( "Serve need more anchor slots!"))
        }
    }

})()

export default function ( agentOpts:AgentOpts ){
    agent.opts = agentOpts;

    if( agentOpts.selfServer ){
        agentOpts.serverHost = "127.0.0.1"
        require('../server' ).default( agentOpts );
    }

    agent.connect().then( value => {
        console.log( "[ANCHORAIO] Agent>", chalk.greenBright( `Connected to server on ${agentOpts.serverHost}:${String( agentOpts.serverPort )}` ) );
        agent.createServer().then( value1 => {});
    });

    if( !agentOpts.noDNS ) require( "../dns/server" ).startDNS( agentOpts );
    if( !agentOpts.noAPI ) require( "../dns/api" ).startAPI( agentOpts, agent );
}







