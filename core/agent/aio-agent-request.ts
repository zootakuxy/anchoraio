import {AgentRequest, AioAgent} from "./aio-agent";
import {AioSocket} from "../socket/socket";
import {AioType, AnchorMeta} from "../anchor/server";
import {Event, HEADER, SIMPLE_HEADER} from "../anchor/share";
import chalk from "chalk";
import {message} from "memfs/lib/internal/errors";
import {AgentServer, AioAnswerer} from "../dns/aio.resolve";

export class AioAgentRequest {
    private readonly _agent:AioAgent;
    private _pendentsRequest:AioSocket<AnchorMeta<AgentRequest>>[] = [];

    constructor( agent:AioAgent ) {
        this._agent = agent;
        this.agent.anchorServer.onConnection( aioSocket => {
            this.onConnection( aioSocket );
        } );
    }

    get agent(): AioAgent {
        return this._agent;
    }

    public continue(){
        this._pendentsRequest.splice(0, this._pendentsRequest.length ).forEach( value => {
            this.startAnchor( value );
        });
    }

    private startAnchor( req:AioSocket<AnchorMeta<AgentRequest>> ){
        req.meta.extras.status = "income";
        this.agent.anchorServer.auth( {
            anchors: [ req.id ],
            aioType: AioType.AIO_IN,
            busy: req.id,
            origin: this.agent.identifier,
            needOpts:{},
        }, this.agent.connect.id, { onError: "END", name: "REQUEST"} );


        console.log( "[ANCHORIO] Agent>", `Anchor request ${ req.id} started!`);
        let aioAnswerer = req.meta.extras.aioAnswerer;
        let agentServer = req.meta.extras.agentServer;
        this.agent.anchorServer.nextSlot( AioType.AIO_OUT, this.agent.identifier ).then( connection => {
            if( !connection ){
                console.log( "[ANCHORIO] Request>", this.agent.identifier, aioAnswerer.application, "\\", chalk.redBright("rejected"));
                return req.close();
            }

            let pack:typeof SIMPLE_HEADER.aio;
            this.agent.connect.server.send( Event.AIO, pack = HEADER.aio({
                origin: this.agent.identifier,
                server: agentServer.identifier,
                request: req.id,
                application: aioAnswerer.application,
                domainName: aioAnswerer.domainName,
                anchor_form: connection.id
            }) );
            this.agent.anchorServer.anchor( req, connection, pack.request, pack.application );
            console.log( "[ANCHORIO] Agent>", `New request id ${ req.id } from ${ this.agent.identifier } to ${ pack.application }@${ pack.server } ${ chalk.blueBright( "\\ACCEPTED AIO ANCHOR")}`);
        });
    }

    onConnection( req:AioSocket<AnchorMeta<AgentRequest>> ){
        req.meta.extras = req.meta.extras || {};
        req.meta.extras.type = "local-request";

        let rejectConnection = ( message?:string )=>{
            console.log( "[ANCHORIO] Agent>", `${chalk.redBright("Rejected new request connection")}.  ${ message||"" }` );
            req.end( () => { });
        }

        let acceptConnection = ( aioAnswerer: AioAnswerer, agentServer: AgentServer )=>{
            console.log( "[ANCHORIO] Agent>", `${chalk.greenBright("Accepted new request connection")}` );
            req.meta.extras.aioAnswerer = aioAnswerer;
            req.meta.extras.agentServer = agentServer;
            if( this.agent.connect.authStatus === "accepted" ) this.startAnchor( req );
            else this._pendentsRequest.push( req );
        }

        if( !this.agent.isAvailable){
            let status = "";
            if( ! this.agent.isConnected ) status = "disconnected";
            if( this.agent.connect.authStatus !== "accepted" ) status+= ` ${this.agent.connect.authStatus}`;
        }

        req.on( "error", err =>{ console.log( "[ANCHORIO] Agent>", `Request ID ${ req.id } socket error ${err.message}` ); });

        const remoteAddressParts = req.address()["address"].split( ":" );
        const address =  remoteAddressParts[ remoteAddressParts.length-1 ];

        let aioAnswerer: AioAnswerer, agentServer: AgentServer;

        aioAnswerer = this.agent.aioResolve.serverName( address );
        if( aioAnswerer ) agentServer = this.agent.aioResolve.agents.agents[ aioAnswerer.agent ];

        if( !aioAnswerer ) return rejectConnection( "no answerer domain found!" );
        if( !agentServer ) return rejectConnection( "no agent server found!" );
        acceptConnection( aioAnswerer, agentServer );
    }

}