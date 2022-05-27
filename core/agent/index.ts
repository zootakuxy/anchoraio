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
import {AgentServer, AioAnswerer, AioResolver} from "../dns/aio.resolve";
import chalk from "chalk";
import {AgentOpts} from "./opts";
import {AgentConnection, RemoteListener} from "./listener/remote";
import {LocalListener} from "./listener/local";
import {ApplicationManager} from "./apps";
import {AgentContext} from "../service/agent.service";

type CreatSlotOpts = { query?:number, slotCode?:string };



type AuthStatus = "unknown"|"accepted"|"rejected";

interface AgentRequest {
    id?:string
    status?:"pendent"|"income"|"complete"
    socket:net.Socket,
    agentServer:AgentServer
    aioAnswerer: AioAnswerer
}


interface _Agent {
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

    localListener:LocalListener
    remoteListener:RemoteListener
}

export class Agent implements _Agent{
    anchors:{}
    slots:{ [SlotType.ANCHOR_IN ]: AgentConnection[], [SlotType.ANCHOR_OUT]:  AgentConnection[]} = { [SlotType.ANCHOR_IN]:[], [SlotType.ANCHOR_OUT]:[]}
    inCreate: SlotType[] = [];
    authStatus:AuthStatus = "unknown"
    requests: AgentRequest[] = [];
    identifier:string
    id:string
    server:net.Socket
    local:Server
    private readonly _aioResolve:AioResolver;
    private readonly _appManager:ApplicationManager;
    private readonly _remoteListener:RemoteListener;
    private readonly _localListener:LocalListener;

    public slotManager:SlotManager<AgentConnection>
    private _opts:AgentOpts;
    private readonly _context:AgentContext;


    agentPorts:number[] = [];


    constructor( opts: AgentOpts, context:AgentContext) {
        this._context = context;
        let self = this;
        this.slotManager = new SlotManager<AgentConnection>({
            slots(){ return self.slots },
            handlerCreator( name, anchorID, opts, ...extras){
                return this.createSlots( name, opts );
            }
        });

        this.opts = opts;
        this._remoteListener = new RemoteListener( this );
        this._localListener = new LocalListener( this );
        this._appManager = new ApplicationManager( this );
        this._aioResolve = new AioResolver( this );
    }

    get aioResolve(): AioResolver {
        return this._aioResolve;
    }

    get localListener(): LocalListener {
        return this._localListener;
    }

    get remoteListener(): RemoteListener {
        return this._remoteListener;
    }

    get appManager(): ApplicationManager {
        return this._appManager;
    }

    get context(): AgentContext {
        return this._context;
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

    } public startAnchor( next:AgentRequest ){
        // if( !this.requests.length ) return;
        // let next = this.requests.find( value => value.status === "pendent" );
        this.requests.push( next );
        next.status = "income";
        let agentServer = next.agentServer;
        let req = next.socket;
        let aioAnswerer = next.aioAnswerer;

        console.log( "[ANCHORIO] Agent>", `Anchor request ${ next.id} started!`)

        this.slotManager.nextSlot( SlotType.ANCHOR_OUT ).then(connection => {
            if( !connection ){
                console.log( "[ANCHORIO] Request>", agentServer.identifier, aioAnswerer.application, "\\", chalk.redBright("rejected"));
                return req.end();
            }

            connection.socket.on( "end", (args) => {
                if( req["connected"]) req.end();
            });

            req.on( "end", () => {
                if( connection.socket.connected ) connection.socket.end();
                connection.socket.end();
            });

            req.on( "close", hadError => {
                console.log( "Request Closed!")
                // connection.socket.end();
            });

            let pack:AnchorHeader = {
                origin: this.identifier,
                server: agentServer.identifier,
                request: next.id,
                application: aioAnswerer.application,
                domainName: aioAnswerer.domainName,
                anchor_form: connection.id
            }
            writeInSocket( this.server, headerMap.AIO( pack ));
            connection.anchor( req );

            if( this.slots[SlotType.ANCHOR_OUT].length < this.opts.minSlots ) this.createSlots( SlotType.ANCHOR_OUT ).then();
            console.log( "[ANCHORIO] Request>", agentServer.identifier, aioAnswerer.application, "\\", chalk.blueBright( "accepted" ));
        }).catch( reason => {
            // console.error(reason)
        })

    } public createSlots(slotType:SlotType, opts?:CreatSlotOpts ):Promise<boolean>{
        if ( !opts ) opts = {};

        if( this.inCreate.includes( slotType ) ) return Promise.resolve( false );
        this.inCreate.push( slotType );

        return new Promise((resolve ) => {
            let counts = (this.opts.maxSlots||1) - this.slots[slotType].length;
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

                this.remoteListener.registerConnection( next, "anchor", this.anchors, ).then(connection => {
                    this.slots[ slotType ].push( connection );
                    connection.socket.on( "close", ( ) => {
                        let index = this.slots[ slotType ].findIndex( slot => connection.id === slot.id );
                        if( index !== -1 ) this.slots[ slotType ].splice( index, 1 );
                    });
                    created++;
                    if( created === opts.query ){
                        resolved = true;
                        resolve( true );
                    } else if( created === counts && !resolved ) {
                        resolved = true;
                        resolve( true );
                    }

                    let events:(Event|string)[] = [ Event.SLOTS ];
                    if( opts.slotCode ){
                        events.push( eventCode(Event.SLOTS, opts.slotCode ));
                    }

                    if( created === counts ) events.push( eventCode( Event.SLOTS, "END") );
                    if( created === counts && opts.slotCode ) events.push( eventCode( Event.SLOTS, "END", opts.slotCode ) );

                    _anchors.push( connection.id );

                    if( created == counts ){
                        writeInSocket( this.server, headerMap.SLOTS({
                            slot:slotType,
                            origin:this.identifier,
                            server:this.identifier,
                            agent: this.identifier,
                            anchors: _anchors,
                            slotCode: opts.slotCode,
                            id: connection.id,
                        }, ...events ));

                        let index = this.inCreate.findIndex( value1 => value1 === slotType );
                        while ( index != -1 ){
                            this.inCreate.splice( index, 1 );
                            index = this.inCreate.findIndex( value1 => value1 === slotType );
                        }
                    }
                });
            }
        })

    } connect() {
        return new Promise((resolve) => {
            this.server = this.remoteListener.createConnection( "agent", connection => {
                this.id = connection.id;
                writeInSocket( connection.socket, headerMap.AUTH({
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

}







