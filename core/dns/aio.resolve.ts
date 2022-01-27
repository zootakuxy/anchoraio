import {DnsAnswer, Packet} from "dns2";
import {localhost} from "./localhost";
import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import {agentOptions} from "../agent/opts";
export type AgentServer = { name:string, identifier:string, match:RegExp }
export type AioAnswerer = {
    address:string,
    domainName:string,
    agent:string,
    application?:number|string,
    answer:DnsAnswer[]
};

export function domainMath( domainName ):RegExp{
    return new RegExp(`((^)*.${domainName})|((^)${domainName})$`);
}

export function asAio( name:string ):AgentServer{
    let parts = name.split( "." )
        .filter( value => value && value.length );
    if( parts.length < 2 ) parts.push( "aio" );

    if( parts[ parts.length-1 ] !== "aio" ) parts.push( "aio" );

    let identifier = parts.join( "." );
    parts.pop();
    name = parts.join(".");

    return { name, identifier, match:domainMath( identifier ) };
}

const agentOpts = agentOptions();


export const aioResolve = new class AioReso {
    agents:{ agents:{[p:string|number]:AgentServer}}
    resolves:{ resolve?:{ aio?:{ [p:string|number]:AioAnswerer} }};

    constructor() {
        if( fs.existsSync( path.join( agentOpts.etc, "aoi.resolve.conf" ) ) ) {
            this.resolves = ini.parse( fs.readFileSync( path.join( agentOpts.etc, "aoi.resolve.conf")).toString() );
            if( !this.resolves ) this.resolves = {};
            if( !this.resolves.resolve ) this.resolves.resolve = {};
            if( !this.resolves.resolve.aio ) this.resolves.resolve.aio = {};

            Object.keys( this.resolves.resolve.aio ).forEach( key => {
                let resolve = this.resolves.resolve.aio[ key ];
                resolve.answer.forEach( (value, index) => {
                    if( typeof value === "string" ) resolve.answer[ index ] = JSON.parse( value );
                })
            });

        } else {
            this.resolves = { resolve: { aio: {}}}
        }

        this.agents = ini.parse( fs.readFileSync( path.join( agentOpts.etc, "agent.conf") ).toString() ) as any;
        Object.keys( this.agents.agents ).forEach( key => {
            let agent = this.agents.agents[ key ];

            if( typeof agent === "string" ){
                agent = asAio( agent );
            } else {
                Object.assign( agent, asAio( agent.identifier ) );
            }

            agent.match = domainMath( agent.identifier );
            delete this.agents.agents[ key ];
            this.agents.agents[ agent.identifier ] = agent;
        });
    }

    aioResolve( domainName:string ):DnsAnswer[]{
        let key = Object.keys( this.agents.agents ).find(next => { return this.agents.agents[next].match.test( domainName ); })
        let server = this.agents.agents[ key ];
        if( !server ) return null;

        key = Object.keys( this.resolves.resolve.aio ).find( value => this.resolves.resolve.aio[ value ].domainName === domainName );
        let resolve = this.resolves.resolve.aio[ key ];

        if( !resolve ){

            let address;
            while ( !address ){
                address = localhost.next();
                if( Object.keys( this.resolves.resolve.aio ).includes( address ) ) address = null;
            }

            let application;
            let _domainParts = domainName.split( "." );
            let _serverParts = server.identifier.split( "." );
            if( _domainParts.length > _serverParts.length )  application = _domainParts.shift()

            resolve = {
                answer: [{
                    name: domainName,
                    type: Packet.TYPE.A,
                    class: Packet.CLASS.IN,
                    ttl: 300,
                    address: address
                }],
                agent: server.identifier,
                address: address,
                domainName: domainName
            };
            if( application ) resolve.application = application;

            this.resolves.resolve.aio[address] = ( resolve )
            fs.writeFile( path.join( agentOpts.etc, "aoi.resolve.conf" ), ini.stringify( this.resolves, {
                whitespace: true
            }), ()=>{})
        }

        return resolve.answer;
    }

    serverName( address:string ){
        return this.resolves.resolve.aio[ address ];
    }
}();