import {DnsAnswer} from "dns2";
import moment from "moment";
import {agentOptions } from "../agent/opts";
const { TCPClient } = require('dns2');

export const netResolve = new class NetResolver {
    dnsResolves = agentOptions().dns.map( name => {
        return {
            resolve: TCPClient( name ),
            name
        }
    });

    resolves:{ [domain:string]:DnsAnswer[] } = {};
    async resolve( domainName:string ):Promise<DnsAnswer[]>{
        return new Promise( (_resolve, reject) => {
            let resolve = ( a:DnsAnswer[], dns)=>{
                resolve = ()=>{};
                console.log( "[dns resolve]", domainName, "\\", dns.name )
                this.resolves[ domainName ] = a;
                _resolve( a );
            }

            let exists = this.resolves[ domainName ];
            if( exists ) return Promise.resolve( exists );

            this.dnsResolves.forEach( dns => {
                dns.resolve( domainName ).then( ( result )=>{
                    if( result.answers.length > 0 ) resolve( result.answers, dns );
                }).catch( reason => console.error("dns error", moment(), dns.name, reason.message ))
            });
        })
    }
};

