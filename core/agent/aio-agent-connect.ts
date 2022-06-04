import { AioSocket, ConnectionParams } from "../aio/socket";
import { AgentRequest, AioAgent} from "./aio-agent";
import {Event, HEADER, SIMPLE_HEADER} from "../aio/share";
import { AioAgentListener } from "./aio-agent-listener";
import { aio } from "../aio/aio";
import chalk  from "chalk";
import { AioType, AnchorMeta, NeedAnchorOpts } from "../aio/anchor-server";
type AuthStatus = "unknown"|"accepted"|"rejected";

export class AioAgentConnect {
    private readonly _server:AioSocket<any>;
    private readonly _agent:AioAgent;
    private _id:string;
    private _authStatus:AuthStatus;
    private _listener: AioAgentListener;
    private chanel: AioSocket<any>[] = [];
    private _anchorPort:number;

    constructor( aioAgent:AioAgent ) {
        this._authStatus = "unknown";
        this._agent = aioAgent;
        let self = this;
        this._server = aio.connect({
            host: this._agent.opts.serverHost,
            port: this._agent.opts.serverPort,
            listenEvent: true,
            isConnected: false,
            auth: HEADER.auth(  {
                origin: self._agent.identifier,
                server: self._agent.identifier,
                token: "1234",
                level: "primary"
            }),
            autoReconnect: () => this.autoReconnect()
        });

        this._server.onListen( "auth",  ( identifier, authResult:typeof SIMPLE_HEADER.authResult ) => {
            if( !identifier ){
                this._id = null;
                this._authStatus = "rejected";
                this._anchorPort = null;
                return;
            }

            if( identifier ){
                this._id = identifier;
                this._anchorPort = authResult.anchorPort;
                this._authStatus = "accepted";
                return;
            }

        });

        this._listener = new AioAgentListener( this );
        this.server.on( "error", err => this._id = null );
        this.server.on( "close", hadError => this._id = null );
    }

    get id(): string {
        return this._id;
    } get server(): AioSocket<any> {
        return this._server;
    } get agent(): AioAgent {
        return this._agent;
    } get authStatus(): AuthStatus {
        return this._authStatus;
    } get anchorPort(): number {
        return this._anchorPort;
    }

    private autoReconnect():ConnectionParams {
        return { port: this.agent.opts.serverPort, host: this.agent.opts.serverHost };
    }


    needAnchor( type:AioType, _server?:string, opts?:NeedAnchorOpts ):Promise<(AioSocket<AnchorMeta<AgentRequest>>)>{
        if( !opts ) opts = {};
        return new Promise<(AioSocket<AnchorMeta<AgentRequest>>)>( ( resolve ) => {
            let counts = ( this.agent.opts.maxSlots||1 ) - this.agent.anchorServer.counts( type, this.agent.identifier );
            if( !counts || counts < 1 ) counts = 1;
            counts = 1;
            let created = 0;

            let resolved:boolean = false;
            if( !counts ) return resolve( null );
            let _anchors:string[] = [];
            let _busy:string;
            let _sockets:AioSocket<any> [] = [];

            for ( let i = 0; i< counts; i++ ) {
                let _canReconnect = true;
                const aioAnchor = aio.connect( {
                    host: this.agent.opts.serverHost,
                    port: this.anchorPort,
                    listenEvent: true,
                    isConnected: false,
                    autoReconnect:()=>{
                        if( _canReconnect ) return {
                            port: this.anchorPort,
                            host: this.agent.opts.serverHost
                        }
                    }
                });

                aioAnchor.on( "connect", () => {
                    _canReconnect = false;
                })

                aioAnchor.onListen("auth", id => {
                    this.agent.anchorServer.register( aioAnchor, { anchorPoint: "CONNECTION" } );

                    _sockets.push( aioAnchor );
                    if( opts?.busy && !_busy ) _busy = aioAnchor.id ;
                    let auth_ = {
                        anchors: [ aioAnchor.id ],
                        busy: _busy,
                        aioType: type,
                        origin: this.agent.identifier,
                        needOpts: opts,
                    };

                    this.agent.anchorServer.auth( auth_ , this.id, { onError: "RESTORE", name: `${type}-CONNECTION`} );
                    created++;

                    if( opts?.busy && !resolved ){
                        resolved = true;
                        resolve( _sockets.find( value => value.id === _busy ));
                    }

                    if( created === counts && !resolved ){
                        resolved = true;
                        resolve( _sockets.find( value => value.id !== _busy) );
                    }

                    _anchors.push( aioAnchor.id );

                    let pack = HEADER.slot({
                        aioType: type,
                        busy: _busy,
                        origin: this.agent.identifier,
                        anchors: _anchors,
                        needOpts: opts
                    });

                    if( created === counts ){
                        this.server.send( Event.SLOTS, pack );
                    }
                })

            }
        });

    } createChanel(){

        this.chanel.forEach( chanel => {
            if( chanel.connected ) chanel.close();
        });

        this.chanel.length  = 0;

        for (let i = 0; i < ( this.agent.opts.chanel||2); i++) {

            let connection = aio.connect({
                host: this.agent.opts.serverHost,
                port: this.agent.opts.serverPort,
                listenEvent: true,
                isConnected: false,
                auth: HEADER.auth( {
                    level: "secondary",
                    origin: this.agent.identifier,
                    server: this.agent.identifier,
                    referer: this.id,
                    token: "1234"
                })
            });

            connection.onListen( "auth", (identifier, auth:typeof SIMPLE_HEADER.authResult ) => {
                if( !identifier ){
                    console.log( "[ANCHORIO] Agent>", chalk.redBright( `Create new chanel rejected by server with ${ auth?.message }!` )  );
                    return;
                }
                this.chanel.push( connection );
                console.log( "[ANCHORIO] Agent>", `Create new chanel ${ chalk.blueBright( connection.id )}  referer ${ this.id }!`  );
            });

        }
    }

}