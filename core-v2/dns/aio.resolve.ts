import * as fs from "fs";
import ini from "ini";
import {Localhost} from "./localhost";
import Path from "path";
import {Detect, DirWatch} from "../utils/dir-watch";
import {Defaults} from "../defaults";
import {AppProtocol} from "../protocol";

export type AgentServer = {
    name:string,
    identifier:string,
    match:RegExp,
    reference?:string,
    resolved:Resolved[]
}
export function domainMath( domainName ):RegExp{
    return new RegExp(`((^)*.${domainName})$|((^)${domainName})$`);
}

export interface Resolved {
    reference:string,
    application:string,
    server:string,
    identifier:string
    aioHost:string,
    address:string,
    linkedService?:string,
    linkedHosts?:string,
    linkedReference?:string
    getawayRelease?:number
    getawayReleaseTimeout?:number|"never"
    getawayReleaseOnDiscover?:boolean,
    requestTimeout:number|"never",
    protocol?:AppProtocol
}

export interface AioResolverOptions {
    etc:string,
    getawayRelease: number,
    getawayReleaseTimeout?:number|"never"
    requestTimeout?:number|"never"
    getawayReleaseOnDiscover: boolean
}

const extension = "resolve.conf";
export const RESOLVE_REGEXP = RegExp( `((^)*.${extension})$|((^)${extension})$` );

type ResolvedEntry = {
    aio?:{
        [serverName:string]:{
            [app:string]:Resolved
        }
    }
}

export type TimeOut = number|"never";

export type AIOHostRegisterOptions = {
    getawayRelease?:number
    getawayReleaseTimeout?: TimeOut
    requestTimeout?: TimeOut
    linkedHosts:string,
    linkedReference:string
    getawayReleaseOnDiscover?:boolean
}

export function asTimeOut( value:string ):TimeOut{
    if( !value ) return null;
    if( value.toString().toLowerCase() === "never" ) return "never";
    let _number = Number( value );
    if ( Number.isNaN( _number ) ) return null;
    return Math.trunc( _number );
}

export class AioResolver {
    opts:AioResolverOptions;
    localhost:Localhost;
    dirWatch:DirWatch;

    servers:{[p:string]:AgentServer} = {};
    aioHost:{[p:string]:Resolved}
    address:{[p:string]:Resolved}


    constructor( opts:AioResolverOptions ) {
        this.opts = opts;
        this.aioHost = { };
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

        let resolve:{aio?:{ [p:string]:{ [p:string]:Resolved|string }}} = ini.parse( fs.readFileSync( filename ).toString() );
        if( !resolve ) resolve = {};
        resolve.aio = resolve.aio || {};

        if(typeof resolve["domains"] === "object" && !!resolve[ "domains" ] ){
            resolve.aio = Object.assign( resolve.aio, resolve["domains"] )
        }

        Object.entries( resolve.aio ).forEach( ([ server, remotes]) => {
            let identifier = `${server}.aio`;
            this.servers[ server ] = {
                name: server,
                identifier,
                match: domainMath( identifier ),
                reference: filename,
                resolved:[]
            };

            Object.entries( remotes ).forEach( ( [ application, address ])=>{

                let aioHost = `${ application}.${identifier}`;
                let _resolved:Resolved;
                if( typeof address === "string" ){
                    _resolved = {
                        address: address,
                    } as Resolved;
                } else if( typeof address === "object") {
                    _resolved = address;
                }

                _resolved.protocol = _resolved.protocol || "aio";
                // _resolved.getawayRelease = _resolved.getawayRelease || Defaults.protocol[ resolve.]

                let resolved:Resolved = {
                    reference: filename,
                    address:_resolved.address,
                    server: server,
                    application: application,
                    protocol: _resolved.protocol,
                    aioHost: aioHost,
                    identifier: identifier,
                    getawayRelease: _resolved.getawayRelease || this.opts.getawayRelease ||Defaults.getawayRelease,
                    getawayReleaseTimeout: _resolved.getawayReleaseTimeout || this.opts.getawayReleaseTimeout ||Defaults.getawayReleaseTimeout,
                    requestTimeout: _resolved.requestTimeout|| this.opts.requestTimeout ||Defaults.requestTimeout,
                    getawayReleaseOnDiscover: _resolved.getawayReleaseOnDiscover || this.opts.getawayReleaseOnDiscover,
                    linkedService: _resolved.linkedService,
                    linkedReference: _resolved.linkedReference,
                    linkedHosts: _resolved.linkedHosts
                };

                let numbers:(keyof Resolved & (
                    "getawayReleaseTimeout"|"getawayRelease"|"requestTimeout"
                ))[] = ["getawayReleaseTimeout","getawayRelease", "requestTimeout"];

                numbers.forEach( _timeout => {
                    if( resolved[_timeout] === "never" ) return;
                    resolved[_timeout] = Number( resolved[_timeout] );
                    if( !resolved[ _timeout ] || Number.isNaN( resolved[ _timeout ] ) ){
                        resolved[ _timeout ] = Defaults[_timeout];
                    }
                })

                this.aioHost[ resolved.aioHost ] = resolved;
                this.address[ resolved.address ] = resolved;
            });

            this.servers[ server ].resolved = Object.entries( this.address )
                .map( ([address, resolved]) =>resolved )
                .filter( value => value.server === server );

        });

    }

    detachResolveFile( filename:string ){
        Object.entries( this.aioHost ).forEach( ([ key, value])=>{
            if( value.reference === filename ) delete this.aioHost[ key ];
        })
        Object.entries( this.address ).forEach( ([ key, value])=>{
            if( value.reference === filename ) delete this.address[ key ];
        })
        Object.entries( this.servers ).forEach( ([ key, value])=>{
            if( value["reference"] === filename ) delete this.servers[ key ];
        })
    }

    aioRegisterServer( aioHost:string, opts:AIOHostRegisterOptions, linked:( address:string )=>{host:string[],reference:string, service }):Resolved{
        let parts = aioHost.split("." ).map( value => value.trim().toLowerCase() );
        aioHost = parts.join( "." );

        let server = Object.keys( this.servers ).find(next => { return this.servers[next].match.test( aioHost ); })

        if( parts.length !== 3 || parts[parts.length-1] !== "aio" ) return null;
        if( parts.filter( value => !value || !value.length).length ) return  null;
        server = parts[ 1 ];
        let identifier = [ server, "aio" ].join(".");
        let appName = parts[ 0 ];
        let address:string = this.localhost.next();

        let filename = Path.join( this.opts.etc, "resolve", `${address}-${aioHost}.resolve.conf` );

        let resolved:Resolved = {
            address: address,
            application: appName,
            server: server,
            identifier: identifier,
            aioHost: aioHost,
            reference: filename,
            requestTimeout: opts.requestTimeout

        }

        return this.sets( resolved, opts, linked );
    }

    sets( resolved:Resolved, opts:AIOHostRegisterOptions, linked:( address:string )=>{host:string[],reference:string, service }):Resolved{
        let _linked = linked( resolved.address );

        if ( resolved.linkedReference && resolved.linkedReference !== _linked.reference  && fs.existsSync( resolved.linkedReference ) ) {
            fs.unlinkSync( resolved.linkedReference );
        }

        resolved = Object.assign(resolved, {
            getawayRelease: opts.getawayRelease||Defaults.getawayRelease,
            getawayReleaseTimeout: opts.getawayReleaseTimeout || Defaults.getawayReleaseTimeout,
            requestTimeout: opts.requestTimeout || Defaults.requestTimeout,
            getawayReleaseOnDiscover: opts.getawayReleaseOnDiscover || false,
            linkedHosts: _linked?.host,
            linkedService: _linked?.service,
            linkedReference: _linked?.reference,
        });

        let entry:ResolvedEntry = {
            aio : {
                [ resolved.server ] : {
                    [ resolved.application ]: resolved
                }
            }
        }

        this.servers[ resolved.server ] = {
            name: resolved.application,
            identifier: resolved.identifier,
            match: domainMath( resolved.identifier ),
            reference: resolved.reference,
            resolved: []
        }

        this.aioHost[ resolved.aioHost ] = resolved;
        this.address[ resolved.address ] = resolved;
        fs.writeFileSync( resolved.reference, ini.stringify( entry, {
            whitespace: true
        } ) );

        this.servers[ resolved.server ].resolved = Object.entries( this.address )
            .map( ([address, resolved]) =>resolved )
            .filter( value => value.server === resolved.server );
        return resolved;
    }




        serverOf( domainName:string ){
        let parts = domainName.split("." ).map( value => value.trim().toLowerCase() );
        domainName = parts.join( "." );
        let agentServerName = Object.keys( this.servers ).find(next => { return this.servers[next].match.test( domainName ); })
        return this.servers[ agentServerName ];
    }

    aioResolve( aioHost:string ):Resolved{
        let parts = aioHost.split("." ).map( value => value.trim().toLowerCase() ).filter( (value, index) => value?.length );
        let [ _aio, _server, _app ] = [...parts].reverse();
        aioHost = parts.join( "." );

        let agentServerName = Object.keys( this.servers ).find(next => { return this.servers[next].match.test( aioHost ); })
        let agentServer = this.servers[ agentServerName ];

        if( !agentServer ) return null;
        return  this.aioHost[ aioHost ];

    }

    resolved(address:string ){
        return this.address[ address ];
    }
}