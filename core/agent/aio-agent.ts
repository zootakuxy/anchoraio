import {AgentOpts} from "./opts";
import {AioSocket} from "../aio/socket";
import {AioAgentConnect} from "./aio-agent-connect";
import {AgentServer, AioAnswerer, AioResolver} from "../dns/aio.resolve";
import chalk from "chalk";
import {AgentContext} from "../service/agent.service";
import {AioAnchorServer, AioType, AnchorMeta} from "../aio/anchor-server";
import {AioAplicationManager} from "./aio-application-manager";
import {AioAgentRequest} from "./aio-agent-request";

export interface AgentRequest {
    type?: "local-request"|"remote-request"
    status?:"pendent"|"income"|"complete",
    result?: "success"|"cancelled"|"rejected"
    aioAnswerer?: AioAnswerer
    agentServer?:  AgentServer

}


export class AioAgent {
    private readonly _identifier:string
    private readonly _anchorServer:AioAnchorServer<AgentRequest>
    private readonly _opts:AgentOpts;
    private _server: AioSocket<any>;
    private readonly _connect:AioAgentConnect;
    private readonly _appManager:AioAplicationManager;
    private readonly _aioResolve:AioResolver;
    private readonly _context:AgentContext;
    private readonly _request:AioAgentRequest;


    constructor( opts:AgentOpts, context:AgentContext ) {
        let self = this;
        this._opts = opts;
        this._identifier = opts.identifier;
        this._context = context;
        this._connect = new AioAgentConnect( this );

        this._anchorServer = new AioAnchorServer<AgentRequest>( {
            port: this.opts.agentPort,
            sendHeader: false,
            identifier: this.identifier,
            minSlots: this.opts.minSlots,
            maxSlots: this.opts.maxSlots,
            anchorPoint: "CLIENT",
            onNeedAnchor: (type, server, opts) => {
                return this.connect.needAnchor( type, server, opts )
            }, chanelOf( server: string ): AioSocket<any> {
                return self.connect.server;
            }
        });
        this._appManager = new AioAplicationManager( this );

        this._aioResolve = new AioResolver( this );
        this._request = new AioAgentRequest( this );

    }


    get isConnected(){
        return this.connect.server.connected;
    }

    get isAvailable( ){
        return this.connect.server.connected && this.connect.authStatus === "accepted";

    }

    get identifier(): string {
        return this._identifier;
    } get opts() {
        return this._opts;
    } get server() {
        return this._server;
    } get connect() {
        return this._connect;
    } get anchorServer(): AioAnchorServer<AgentRequest> {
        return this._anchorServer;
    } get agent(){
        return this
    } get appManager(): AioAplicationManager {
        return this._appManager;
    } get request(): AioAgentRequest {
        return this._request;
    } get aioResolve(): AioResolver {
        return this._aioResolve;

    } start(){
        this.anchorServer.start( () => {
            console.log( "[ANCHORIO] Agent>", `Running Agent Proxy ${ this.identifier } on port ${ chalk.greenBright(String( this.opts.agentPort)) }`) ;
        });
    }

}