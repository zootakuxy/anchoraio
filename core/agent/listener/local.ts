import detectPort from "detect-port";
import net from "net";
import {nanoid} from "nanoid";
import chalk from "chalk";
import {Agent} from "../index";
import {asAIOSocket} from "../../global/AIOSocket";

export class LocalListener{
    public requestCount:number = 0;
    agent:Agent;

    constructor( agent:Agent ) {
        this.agent = agent;
    }

    createServer( ){
        return new Promise(async (resolve, reject) => {
            let nextPort;
            if( !this.agent.agentPorts.includes( this.agent.opts.agentPort ) ) nextPort = this.agent.opts.agentPort;
            else nextPort = await detectPort( this.agent.opts.agentPort +100 );

            let serverListen = net.createServer(req => {
                req["connected"] = true;
                if( !this.agent.isAvailable ) return req.end( () => {
                    let status = "";
                    if( ! this.agent.isConnected ) status = "disconnected";
                    if( this.agent.authStatus !== "accepted" ) status+= ` ${this.agent.authStatus}`;
                    console.log( "[ANCHORIO] Agente>", chalk.redBright( `Request canceled because agent is offline: ${status.trim()}!`))
                });
                let requestId = `${this.agent.identifier}://${nanoid( 12 )}/${ this.requestCount++}`;
                console.log( "[ANCHORIO] Agent>", `Received request ${ requestId }` );


                req.on( "error", err =>{ console.log( "[ANCHORIO] Agent>", `Request ID ${ requestId} socket error ${err.message}` ); })
                req.on( "close", () => {
                    req["connected"] = false;
                    console.log( "[ANCHORIO] Agent>", `Request ID ${ requestId} socket closed`)
                })

                const remoteAddressParts = req.address()["address"].split( ":" );
                const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
                let aioAnswerer = this.agent.aioResolve.serverName( address );



                if( !aioAnswerer ) return req.end( () => { });
                let agentServer = this.agent.aioResolve.agents.agents[ aioAnswerer.agent ];
                if( !agentServer ) return req.end( () => { });

                let requestConnection = asAIOSocket( req, requestId );


                this.agent.anchorManager.register( requestConnection  );
                this.agent.startAnchor( {  agentServer,  requestConnection,  aioAnswerer, id: requestId } )

            }).listen( nextPort, ()=>{
                console.log( "[ANCHORIO] Agent>", chalk.greenBright(`Running Agent ${ this.agent.identifier } on port ${ nextPort }`) );
                resolve( nextPort );
                this.agent.agentPorts.push( nextPort );
                if( nextPort === this.agent.opts.agentPort ) this.agent.local = serverListen;
            });

        })

    }
}