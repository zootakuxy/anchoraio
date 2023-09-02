import {DnsAnswer, Packet} from "dns2";
import * as fs from "fs";
import ini from "ini";
import {Localhost} from "./localhost";
import Path from "path";
import {Detect, DirWatch} from "../utils/dir-watch";

export type AgentServer = { name:string, identifier:string, match:RegExp, reference?:string }
export type AioAnswerer = {
    address:string,
    domainName:string,
    agent:string,
    application?:number|string,
    answer:DnsAnswer[]
};

export function domainMath( domainName ):RegExp{
    return new RegExp(`((^)*.${domainName})$|((^)${domainName})$`);
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

export interface Resolved {
    reference:string,
    application:string,
    server:string,
    serverIdentifier:string
    domainName:string,
    address:string
}


export interface AioResolverOptions {
    etc:string
}

const extension = "resolve.conf";
export const RESOLVE_REGEXP = RegExp( `((^)*.${extension})$|((^)${extension})$` );

export class AioResolver {
    opts:AioResolverOptions;
    localhost:Localhost;
    dirWatch:DirWatch;

    servers:{[p:string|number]:AgentServer} = {};
    domains:{[p:string]:Resolved}
    address:{[p:string]:Resolved}


    constructor( opts:AioResolverOptions ) {
        this.opts = opts;
        this.domains = { };
        this.address = { };
        this.servers = { };
        this.localhost = new Localhost( opts );
        this.dirWatch = new DirWatch();

        let bases = [
            { base: "resolve", "extension": "resolve.conf" }
        ];

        bases.forEach( value => {
            this.dirWatch.acceptor( Path.join( this.opts.etc, value.base), RegExp( `((^)*.${value.extension})|((^)${value.extension})$` ));
        })



        this.dirWatch.listener.on( "reader", (list:string[]) => {
            list.forEach( filename => {
                if( RESOLVE_REGEXP.test( filename ))  this.onResolveFile( filename, { filename, basename: Path.basename(filename), event: "write", dirname: Path.dirname( filename )});
            });
        });

        this.dirWatch.listener.on( "write", (filename, details:Detect) => {
            if( RESOLVE_REGEXP.test( filename ) ) this.onResolveFile( filename, details );
        });
        this.dirWatch.start();
    }

    private onResolveFile( filename:string, detect:Detect ){
        this.detachResolveFile( filename );
        if( detect?.event === "delete" || !fs.existsSync( filename) ) return;

        let resolve:{domains?:{ [p:string]:{ [p:string]:string}}} = ini.parse( fs.readFileSync( filename ).toString() );
        if( !resolve ) resolve = {};
        resolve.domains = resolve.domains || {};

        Object.entries( resolve.domains ).forEach( ([ server, remotes]) => {
            let identifier = `${server}.aio`;
            this.servers[ server ] = {
                name: server,
                identifier,
                match: domainMath( identifier ),
                reference: filename
            };

            Object.entries( remotes ).forEach( ( [ application, address ])=>{
                let domainName = `${ application}.${identifier}`;

                let resolved:Resolved = {
                    reference: filename,
                    address,
                    server,
                    application,
                    domainName: domainName,
                    serverIdentifier: identifier
                };

                this.domains[ domainName ] = resolved;
                this.address[ address ] = resolved;
            });

        });

    }

    detachResolveFile( filename:string ){
        Object.entries( this.domains ).forEach( ([ key, value])=>{
            if( value.reference === filename ) delete this.domains[ key ];
        })
        Object.entries( this.address ).forEach( ([ key, value])=>{
            if( value.reference === filename ) delete this.address[ key ];
        })
        Object.entries( this.servers ).forEach( ([ key, value])=>{
            if( value.reference === filename ) delete this.servers[ key ];
        })
    }

    aioRegisterServer( domainName:string ):DnsAnswer[]{
        let parts = domainName.split("." ).map( value => value.trim().toLowerCase() );
        domainName = parts.join( "." );

        let agentServerName = Object.keys( this.servers ).find(next => { return this.servers[next].match.test( domainName ); })
        let agentServer = this.servers[ agentServerName ];
        if( agentServer ) return this.aioResolve( domainName );


        if( parts.length !== 3 || parts[parts.length-1] !== "aio" ) return null;
        if( parts.filter( value => !value || !value.length).length ) return  null;
        agentServerName = parts[ 1 ];
        let identifier = [ agentServerName, "aio" ].join(".");
        let appName = parts[ 0 ];
        let address:string = this.localhost.next();

        let entry = {
            domains : {
                [ agentServerName ] : {
                    [ appName ]: address
                }
            }
        }

        let filename = Path.join( this.opts.etc, "resolve", `${address}-${domainName}.resolve.conf` );

        this.servers[ agentServerName ] = {
            name: agentServerName,
            identifier: identifier,
            match: domainMath( identifier ),
            reference: filename
        }

        fs.writeFileSync( filename, ini.stringify( entry ) );

        return [
            {"name": domainName,"type":1,"class":1,"ttl":300,"address":address }
        ]
    }

    serverOf( domainName:string ){
        let parts = domainName.split("." ).map( value => value.trim().toLowerCase() );
        domainName = parts.join( "." );
        let agentServerName = Object.keys( this.servers ).find(next => { return this.servers[next].match.test( domainName ); })
        return this.servers[ agentServerName ];
    }

    aioResolve( domainName:string ):DnsAnswer[]{
        let parts = domainName.split("." ).map( value => value.trim().toLowerCase() );
        domainName = parts.join( "." );

        let agentServerName = Object.keys( this.servers ).find(next => { return this.servers[next].match.test( domainName ); })
        let agentServer = this.servers[ agentServerName ];

        if( !agentServer ) return null;


        let domain = this.domains[ domainName ];

        if( domain ){
            return [ {"name": domainName,"type":1,"class":1,"ttl":300,"address":domain.address } ]
        }


        let address;
        while ( !address ){
            address = this.localhost.next();
            if( Object.keys( this.address ).includes( address ) ) address = null;
        }

        let application;
        let _domainParts = domainName.split( "." );
        let _serverParts = agentServer.identifier.split( "." );
        if( _domainParts.length > _serverParts.length )  application = _domainParts.shift()

        let answer = [{
            name: domainName,
            type: Packet.TYPE.A,
            class: Packet.CLASS.IN,
            ttl: 300,
            address: address
        }];

        if( !application ) return [];

        let resolved =  {
            reference: Path.join( this.opts.etc, "resolve", "dynamic.resolve.conf" ),
            domainName: domainName,
            address: address,
            application,
            server: agentServer.name,
            serverIdentifier: agentServer.identifier
        };

        this.domains[ domainName ] = resolved;
        this.address[ address ] = resolved;

        let configs = {}

        Object.entries( this.servers ).forEach( ( [ key, _server ])=>{
            configs[ _server.name ] = { };
            Object.entries( this.domains ).filter( ([key, value ])=>{
                return value.reference === Path.join( this.opts.etc, "resolve", "dynamic.resolve.conf" );
            }).forEach( ([application, value ])=>{
                configs[ _server.name ][ value.application ] = value.address;
            });
        });


        fs.writeFile( Path.join( this.opts.etc, "resolve", "dynamic.resolve.conf" ), ini.stringify( configs, {
            whitespace: true
        }), ()=>{})

        return answer;
    }

    resolved(address:string ){
        return this.address[ address ];
    }
}