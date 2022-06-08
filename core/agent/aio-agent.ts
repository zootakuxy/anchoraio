import { AgentOpts} from "./opts";
import { AioSocket} from "../aio/socket";
import { AioAgentConnect} from "./aio-agent-connect";
import { AgentServer, AioAnswerer, AioResolver} from "../dns/aio.resolve";
import chalk from "chalk";
import { AgentContext} from "../service/agent.service";
import { AioAnchorServer } from "../aio/anchor-server";
import { AioAplicationManager} from "./aio-application-manager";
import { AioAgentRequest} from "./aio-agent-request";
import { nanoid } from "nanoid";
import {Token, TokenService} from "../service/token.service";
import {TokenOption} from "../service/token.service/opts";

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
    private readonly _server: AioSocket<any>;
    private readonly _connect:AioAgentConnect;
    private readonly _appManager:AioAplicationManager;
    private readonly _aioResolve:AioResolver;
    private readonly _context:AgentContext;
    private readonly _request:AioAgentRequest;
    private readonly _instance:string;
    private readonly _token:Token


    constructor( opts:AgentOpts, context:AgentContext ) {
        let self = this;
        this._opts = opts;
        this._identifier = opts.identifier;
        this._context = context;
        this._instance = `${nanoid(32)}::${ new Date().getTime() }@${this.opts.identifier}`;

        let tokenService = new TokenService( opts as TokenOption );
        this._token = tokenService.token;
        if( !this.token ) {
            console.log( chalk.redBright( `Token for ${ this.opts.identifier } not found or is invalid!` ));
            process.exit(0);
        }

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
            }, emit( server: string, event, opts ) {
                self.connect.server.emit( event, opts );
            }
        });
        this._appManager = new AioAplicationManager( this );

        this._aioResolve = new AioResolver( this );
        this._request = new AioAgentRequest( this );

    }


    get isConnected(){
        return this.connect.server.connected;
    } get isAvailable( ){
        return this.connect.server.connected && this.connect.authStatus === "accepted";
    } get instance(): string {
        return this._instance;
    } get identifier(): string {
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
    } get token(): Token {
        return this._token;

    } get aioResolve(): AioResolver {
        return this._aioResolve;

    } start(){
        this.anchorServer.start( () => {
            console.log( "[ANCHORIO] Agent>", `Running Agent Proxy ${ this.identifier } on port ${ chalk.greenBright(String( this.opts.agentPort)) }`) ;
        });
    }

}