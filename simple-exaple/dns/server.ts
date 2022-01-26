import {aioResolve} from "./aio.resolve";
import {netResolve} from "./net.resolve";
import chalk from "chalk";

const dns2 = require('dns2');
const { Packet } = dns2;

export function startDNSServer (){
    const server = dns2.createServer({
        udp: true,
        tcp: true,
        handle: (request, send, rinfo) => {
            const response = Packet.createResponseFromRequest(request);
            const [ question ] = request.questions;
            const { name } = question;
            let aioResponse = aioResolve.aioResolve( name );
            if( aioResponse && aioResponse.length > 0 ){
                response.answers.push( ...aioResponse )
                send(response);
                return;
            } else {
                netResolve.resolve( name ).then( result => {
                    response.answers.push( ...result )
                    send(response);
                });
            }
        }
    });

    server.on('close', () => {
        console.log('DNS SERVER [OFF]');
    });

    server.listen({
        udp: 53,
        tcp: 53
    }).then( value => {
        console.log( chalk.greenBright`DNS SERVER [ON]` );
    })
}
