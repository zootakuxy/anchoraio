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

            if( !this.dnsResolves.length ){
                return resolve([], { name: "NOTFOUND" })
            }

            let exists = this.resolves[ domainName ];
            if( exists ) return Promise.resolve( exists );

            let count = this.dnsResolves.length;
            let next = ( dns, result?  ) => {
                count--
                if( result?.answers?.length > 0 ) resolve( result?.answers, dns );
                else if( count === 0 ) resolve( [], dns );
            }

            this.dnsResolves.forEach( dns => {
                dns.resolve( domainName ).then( ( result )=>{
                    next( dns, result );
                }).catch( reason =>{
                    next( dns, null );
                    console.error("dns error", moment(), dns.name, reason.message )
                })
            });
        })
    }
};
