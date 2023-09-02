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
        if( !resolve ) resolve = this.resolver.aioRegisterServer( this.opts.aioApplicationDomain );
        let agentServer = this.resolver.serverOf( this.opts.aioApplicationDomain );


        if( this.opts.noPortDomain && this.opts.noPortEntry ){
            let entry = {
                entry:{
                    [ `${agentServer.name}_aio` ]:{
                        entry: this.opts.anchorPort,
                        host:[ this.opts.noPortDomain ],
                        name: this.opts.aioApplicationDomain,
                        description: `Aio entry domain for ${ this.opts.aioApplicationDomain }`,
                        address: resolve[0].address,
                        port: this.opts.anchorPort,
                        protocol: "http",
                        disable: false,
                        opts: {
                        }
                    }

                }
            }

            let entryName = `${this.opts.noPortDomain}_${resolve[0].address}`;
            let entryFileName = Path.join( this.opts.noPortEntry, `aio.${ entryName }.entry.conf` );
            if( !fs.existsSync( Path.dirname( entryFileName ) ) ) fs.mkdirSync( Path.dirname( entryFileName ), {
                recursive: true
            } );
            fs.writeFileSync(entryFileName, ini.stringify( entry ));

            console.log("DOMAIN ENTRY SETS");
            console.log( "FILE:         ", entryFileName );
            console.log( "APPLICATION:  ", this.opts.noPortDomain );
            console.log( "APPLICATION:  ", this.opts.aioApplicationDomain );
            console.log( "ADDRESS:      ", resolve[0].address );
            console.log( "PORT:         ", this.opts.anchorPort );
        }

        return 0;
    }
}