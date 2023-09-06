import {ResolveOptions} from "../../../aio/opts/opts-resolve";
import {AioResolver} from "../../dns/aio.resolve";
import fs from "fs";
import Path from "path";
import ini from "ini";

export class ResolveService {

    private resolver:AioResolver;
    opts:ResolveOptions
    constructor( opts:ResolveOptions) {
        this.resolver = new AioResolver(opts);
        this.opts = opts;
    }

    start():number{

        let resolve = this.resolver.aioResolve( this.opts.aioApplicationDomain );
        let linked = ( address:string ) => {
            if( this.opts.noPortDomain && this.opts.noPortEntry ){
                let entryName = `${this.opts.noPortDomain}_${address}`;
                let entryFileName = Path.join( this.opts.noPortEntry, `aio.${ entryName }.entry.conf` );
                return {
                    host: this.opts.noPortDomain,
                    reference: entryFileName,
                    service: "NOPORT"
                }
            }
        };

        if( !resolve ) resolve = this.resolver.aioRegisterServer( this.opts.aioApplicationDomain, this.opts, linked );
        else resolve = this.resolver.sets( resolve, this.opts, linked );
        let agentServer = this.resolver.serverOf( this.opts.aioApplicationDomain );

        let _labels:({key:string,value:any})[] = [];
        let maxLabel = 0, maxValue;
        let label=( key:string, value?:any)=>{
            if( (key.length+1) > maxLabel ) maxLabel = key.length;
            if( ( (value||"").length+1) > maxValue ) maxValue = (value||"").length;
            _labels.push( {key, value});
        }

        label( "AIO-RESOLVE");
        label( "APPLICATION", resolve.application );
        label( "SERVER", resolve.server );
        label( "IDENTIFIER", resolve.identifier );
        label( "AIOHOST", resolve.aioHost );
        label( "GETAWAY-RELEASE", resolve.getawayRelease );
        label( "GETAWAY-RELEASE-TIMEOUT", resolve.getawayReleaseTimeout );
        label( "GETAWAY-RELEASE-TIMEOUT-BREAK", resolve.getawayReleaseTimeoutBreak );
        label( "GETAWAY-RELEASE-TIMEOUT-BREAK", resolve.getawayReleaseTimeoutBreak );
        label( "FILE", resolve.reference );

        let noPortEntry:any;



        if( resolve.linkedHost && resolve.linkedReference ){
            noPortEntry = {
                entry:{
                    [ `${agentServer.name}_aio` ]:{
                        entry: this.opts.anchorPort,
                        host:[ this.opts.noPortDomain, `*.${this.opts.noPortDomain}` ],
                        name: this.opts.aioApplicationDomain,
                        description: `Aio entry domain for ${ this.opts.aioApplicationDomain }`,
                        address: resolve.address,
                        port: this.opts.anchorPort,
                        protocol: "http",
                        disable: false,
                        opts: {

                        }
                    }
                }
            }


            if( !fs.existsSync( Path.dirname( resolve.linkedReference ) ) ) fs.mkdirSync( Path.dirname( resolve.linkedReference ), {
                recursive: true
            });
            fs.writeFileSync( resolve.linkedReference, ini.stringify( noPortEntry, { whitespace: true } ));

            label( "LINKED NO-PORT" );
            label( "NOPORT DOMAIN:", resolve.linkedHost );
            label( "PORT:", this.opts.anchorPort );
            label( "FILE:", resolve.linkedReference );
        }

            let self = this;
            let show :{ [k in typeof self.opts.format]?:()=>void}= {
            label(){
                _labels.forEach( value => {
                    if( !value ){
                        console.log( value.key );
                        return;
                    }
                    console.log( value.key.padEnd(maxLabel+1, " "), ((value.value||"")+"").padEnd( maxValue+1, " " ));
                    return;
                });
            }, ini(){
                console.log( ini.stringify({
                    aio:{
                        [resolve.server]:{
                            [resolve.application]: resolve
                        }
                    }
                }, { whitespace: true }));

                if( noPortEntry ) console.log( ini.stringify(noPortEntry, { whitespace: true }))
            }, cfg(){
                console.log( Path.relative( self.opts.etc, resolve.reference ) );
                if( resolve.linkedReference )
                    console.log( Path.relative( self.opts.noPortEntry, resolve.linkedReference ) );
            }, file(){
                console.log( resolve.reference );
                if( resolve.linkedReference )console.log( resolve.linkedReference );
            }, json(){
                console.log( JSON.stringify( resolve ) );
            }, table(){
                console.table(resolve)
            }
        }
        if( typeof show[ self.opts.format ] == "function" ) show[ self.opts.format ]();
        return 0;
    }
}