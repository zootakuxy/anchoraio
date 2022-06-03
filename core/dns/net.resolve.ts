import {DnsAnswer} from "dns2";
import moment from "moment";
import {AioAgent} from "../agent/aio-agent";
// import {Agent} from "../agent";

const { TCPClient } = require('dns2');

export class NetResolver {
    agent:AioAgent
    dnsResolves:{resolve, name}[];
    resolves:{ [domain:string]:DnsAnswer[] } = {};

    constructor( agent:AioAgent ) {
        this.agent = agent;
        this.dnsResolves = this.agent.opts.dns.map( name => {
            return { resolve: TCPClient( name ), name }
        });
    }

    async resolve( domainName:string ):Promise<{answers:DnsAnswer[], server}>{
        return new Promise( (_resolve, reject) => {
            let resolve = ( a:DnsAnswer[], dns)=>{
                resolve = ()=>{};
                this.resolves[ domainName ] = a;
                _resolve({
                    answers: a,
                    server: dns.name
                });
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
}
