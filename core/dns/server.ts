import {aioResolve} from "./aio.resolve";
import {netResolve} from "./net.resolve";
import chalk from "chalk";
import {AgentOpts} from "../agent/opts";

const dns2 = require('dns2');
const { Packet } = dns2;

export function startDNS (agentOpts:AgentOpts ){
    let server;
    server = dns2.createServer({
        udp: true,
        tcp: true,
        handle: (request, send, rinfo) => {
            const response = Packet.createResponseFromRequest(request);
            const [ question ] = request.questions;
            const { name } = question;
            let aioResponse = aioResolve.aioResolve( name );
            if( aioResponse && aioResponse.length > 0 ){
                console.log( "[dns resolve]", name, "\\", "127.0.0.1" )
                response.answers.push( ...aioResponse )
                send(response);
                return;
            } else {
                netResolve.resolve( name ).then( result => {
                    if( result.answers.length )
                        console.log( "[dns resolve]", result.server, "\\", "127.0.0.1" )

                    response.answers.push( ...result.answers )
                    send(response);
                });
            }
        }
    });

    server.on('close', () => {
        console.log('[ANCHORAIO] DNS>', "OFF");
    });

    server.listen({
        udp: agentOpts.dnsPort,
        tcp: agentOpts.dnsPort
    }).then( value => {
        console.log( "[ANCHORAIO] Agent>", chalk.greenBright(`DNS server running on port ${agentOpts.dnsPort}`) );
    })
}