import {AgentRequest, AioAgent} from "./aio-agent";
import {AioSocket} from "../socket/socket";
import {AioType, AnchorMeta} from "../anchor/server";
import {Event, HEADER, SIMPLE_HEADER} from "../anchor/share";
import chalk from "chalk";
import {message} from "memfs/lib/internal/errors";
import {AgentServer, AioAnswerer, Resolved} from "../dns/aio.resolve";

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
        let resolved = req.meta.extras.resolved;
        this.agent.anchorServer.nextSlot( AioType.AIO_OUT, this.agent.identifier ).then( connection => {
            if( !connection ){
                console.log( "[ANCHORIO] Request>", this.agent.identifier, resolved.application, "\\", chalk.redBright("rejected"));
                return req.close();
            }

            let pack:typeof SIMPLE_HEADER.aio;
            this.agent.connect.server.send( Event.AIO, pack = HEADER.aio({
                origin: this.agent.identifier,
                server: resolved.serverIdentifier,
                request: req.id,
                application: resolved.application,
                domainName: resolved.domainName,
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

        let acceptConnection = ( resolved:Resolved )=>{
            console.log( "[ANCHORIO] Agent>", `${chalk.greenBright("Accepted new request connection")}` );
            req.meta.extras.resolved = resolved;
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


        let resolved = this.agent.aioResolve.resolved( address );


        if( !resolved ) return rejectConnection( `no resolved answerer domain found from address ${ address }` );
        acceptConnection( resolved );
    }

}