import "../global/init"
import * as net from "net";
import {Server} from "net";
import {
    AnchorHeader,
    Event,
    eventCode,
    headerMap,
    writeInSocket
} from "../global/share";
import {SlotManager, SlotType} from "../global/slot";
import {AgentServer, AioAnswerer } from "../dns/aio.resolve";
import chalk from "chalk";
import {AgentOpts} from "./opts";
import {localListener} from "./listener/local";
import {AgentConnection, remoteListener} from "./listener/remote";

type CreatSlotOpts = { query?:number, slotCode?:string };



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

export const agent = new( class implements Agent{
    anchors:{}
    slots:{ [SlotType.ANCHOR_IN ]: AgentConnection[], [SlotType.ANCHOR_OUT]:  AgentConnection[]} = { [SlotType.ANCHOR_IN]:[], [SlotType.ANCHOR_OUT]:[]}
    inCreate: SlotType[] = [];
    authStatus:AuthStatus = "unknown"
    requests: AgentRequest[] = [];
    identifier:string
    id:string
    server:net.Socket
    local:Server
    public slotManager:SlotManager<AgentConnection>
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
    }  public nextRequest( request:AgentRequest ){
        request.status = "pendent";
        this.requests.push( request );
        this.nextAnchor();
    } public nextAnchor(){
        if( !agent.requests.length ) return;
        let next = agent.requests.find( value => value.status === "pendent" );
        next.status = "income";
        let agentServer = next.agentServer;
        let req = next.socket;
        let aioAnswerer = next.aioAnswerer;

        console.log( "[ANCHORAIO] Agent>", `Anchor request ${ next.id} started!`)

        this.slotManager.nextSlot( SlotType.ANCHOR_OUT ).then(connection => {
            if( !connection ){
                console.log( "[ANCHORAIO] Request>", agentServer.identifier, aioAnswerer.application, "\\", chalk.redBright("rejected"));
                return req.end();
            }
            let pack:AnchorHeader = {
                origin: this.identifier,
                server: agentServer.identifier,
                request: next.id,
                application: aioAnswerer.application,
                domainName: aioAnswerer.domainName,
                anchor_form: connection.id
            }
            console.log( pack );
            writeInSocket( agent.server, headerMap.ANCHOR( pack ));
            connection.anchor( req );

            if( agent.slots[SlotType.ANCHOR_OUT].length < this.opts.minSlots ) this.createSlots( SlotType.ANCHOR_OUT ).then();
            console.log( "[ANCHORAIO] Request>", agentServer.identifier, aioAnswerer.application, "\\", chalk.blueBright( "accepted" ));
        }).catch( reason => {
            // console.error(reason)
        })

    } public createSlots(slotType:SlotType, opts?:CreatSlotOpts ):Promise<boolean>{
        if ( !opts ) opts = {};

        if( this.inCreate.includes( slotType ) ) return Promise.resolve( false );
        agent.inCreate.push( slotType );

        return new Promise((resolve ) => {
            let counts = (this.opts.maxSlots||1) - agent.slots[slotType].length;
            if( !counts || counts < 1 ) counts = 1;
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

                remoteListener.registerConnection( next, "anchor", agent.anchors, ).then(connection => {
                    agent.slots[ slotType ].push( connection );
                    connection.socket.on( "close", ( ) => {
                        let index = agent.slots[ slotType ].findIndex( slot => connection.id === slot.id );
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

    } connect() {
        return new Promise((resolve) => {
            this.server = remoteListener.createConnection( "agent", connection => {
                this.id = connection.id;
                writeInSocket( connection.socket, headerMap.SERVER({
                    origin: this.identifier,
                    server: this.identifier,
                    id: connection.id
                }));
                resolve( true );
            });
            this.server.on( "error", err => this.id = null );
            this.server.on( "close", hadError => this.id = null );
        })
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
        localListener.createServer().then( value1 => {});
    });

    if( !agentOpts.noDNS ) require( "../dns/server" ).startDNS( agentOpts );
    if( !agentOpts.noAPI ) require( "../dns/api" ).startAPI( agentOpts );
}







