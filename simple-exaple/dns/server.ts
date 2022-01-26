import {aioResolve} from "./aio.resolve";
import {netResolve} from "./net.resolve";

const dns2 = require('dns2');
const { Packet } = dns2;

export function startDNSServer (){
    const server = dns2.createServer({
        udp: true,
        tcp: true,
        doh: true,
        handle: (request, send, rinfo) => {
            const response = Packet.createResponseFromRequest(request);
            const [ question ] = request.questions;
            const { name } = question;
            console.log( "resolve...", name );
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
        console.log('server closed');
    });

    server.listen({
        udp: 53,
        tcp: 53,
        doh: 5353
    });
}
