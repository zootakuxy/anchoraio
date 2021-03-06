import chalk from "chalk";

const dns2 = require('dns2');
import  { DnsServer } from "dns2/server";
import {NetResolver} from "./net.resolve";
import {AioAgent} from "../agent/aio-agent";

const { Packet } = dns2;

export class AgentDNS {
    agent:AioAgent
    server: DnsServer
    netResolver:NetResolver

    constructor (agent:AioAgent ){
        this.agent = agent;
        this.netResolver = new NetResolver( this.agent );

        this.server  = dns2.createServer({
            udp: true,
            tcp: true,
            handle: (request, send, rinfo) => {
                const response = Packet.createResponseFromRequest(request);
                const [ question ] = request.questions;
                const { name } = question;
                let aioResponse = agent.aioResolve.aioResolve( name );
                if( aioResponse && aioResponse.length > 0 ){
                    console.log( "[dns resolve]", name, "\\", "127.0.0.1" )
                    response.answers.push( ...aioResponse )
                    send(response);
                    return;
                } else {
                    this.netResolver.resolve( name ).then( result => {
                        if( result.answers.length )
                            console.log( "[dns resolve]", result.server, "\\", "127.0.0.1" )

                        response.answers.push( ...result.answers )
                        send(response);
                    });
                }
            }
        });

        this.server.on('close', () => {
            console.log('[ANCHORIO] DNS>', "OFF");
        });

        this.server.listen({
            udp: this.agent.opts.dnsPort,
            tcp: this.agent.opts.dnsPort
        }).then( value => {
            console.log( "[ANCHORIO] Agent>", chalk.greenBright(`Running Agent DNS SERVER ${ agent.identifier } on port ${ this.agent.opts.dnsPort }`) );
        })
    }
}