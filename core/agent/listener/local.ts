import detectPort from "detect-port";
import net from "net";
import {nanoid} from "nanoid";
import {aioResolve} from "../../dns/aio.resolve";
import {agent} from "../index";
import chalk from "chalk";

export const localListener = new ( class LocalListener{
    public requestCount:number = 0;

    createServer( ){
        return new Promise(async (resolve, reject) => {
            let nextPort;
            if( !agent.agentPorts.includes( agent.opts.agentPort ) ) nextPort = agent.opts.agentPort;
            else nextPort = await detectPort( agent.opts.agentPort +100 );

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
                agent.nextRequest( { agentServer: agentServer, socket: req, aioAnswerer: aioAnswerer, id: requestId } )

            }).listen( nextPort, ()=>{
                console.log( "[ANCHORAIO] Agent>", chalk.greenBright(`Running Agent ${ agent.identifier } on port ${ nextPort }`) );
                resolve( nextPort );
                agent.agentPorts.push( nextPort );
                if( nextPort === agent.opts.agentPort ) agent.local = serverListen;
            });

        })

    }
});