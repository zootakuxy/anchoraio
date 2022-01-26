import {DnsAnswer} from "dns2";
const { TCPClient } = require('dns2');

let clients = [
    "1.1.1.1",
    "8.8.8.8",
    "8.8.4.4"
];

export const netResolve = new class NetResolver {
    dnsResolves = clients.map( value => TCPClient( value ) );
    resolves:{ [domain:string]:DnsAnswer[] } = {};
    async resolve( domainName:string ):Promise<DnsAnswer[]>{
        return new Promise( (_resolve, reject) => {
            let resolve = ( a:DnsAnswer[])=>{
                resolve = ()=>{};
                this.resolves[ domainName ] = a;
                _resolve( a );
            }

            let exists = this.resolves[ domainName ];
            if( exists ) return Promise.resolve( exists );

            this.dnsResolves.forEach( resolver => {
                resolver( domainName ).then( ( result )=>{
                    if( result.answers.length > 0 ) resolve( result.answers );
                })
            });
        })
    }
}()

