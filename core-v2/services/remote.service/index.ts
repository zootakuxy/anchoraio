import {ResolveOptions} from "../../../aio/opts/remote-app";
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
        /*
        [entry.aioV2Maguita]
            #required | Port number
            port = 37050

            #required | domain name
            host[] = maguita.zotakuxy.aio-v2.brainsoftstp.com
        #    host[] = *.maguita.test.brainsoftstp.com

            #requerid | code name
            name = maguita.zootakuxy.aio-v2

            #optional description
            description = Admintracao de desenvolvimento luma

            #optional address (default using localhost address)
            address = 127.10.10.1

            #option protocol http|https (default using request protocol to replay)
            protocol = http

            #optional | Entry active status  (default true)
            disable = false
        [entry.aioV2Maguita.opts]
            # setion for option of http-proxy-middleware
            # declaration  [entry.<<you-entry-name>>.opts]
            # read docummentation in https://www.npmjs.com/package/http-proxy-middleware
            # changeOrigin =  true`~4`~4`~4`~4`~4


         */

        let agentServer = this.resolver.serverOf( this.opts.aioApplicationDomain );

        console.table( this.opts )

        if( this.opts.noPortDomain && this.opts.noPortEntry ){
            let entry = {
                entry:{
                    [ `${agentServer.name}_aio` ]:{
                        entry: this.opts.anchorPort,
                        host:[ this.opts.noPortDomain ],
                        name: this.opts.aioApplicationDomain,
                        description: `Aio entry domain for ${ this.opts.aioApplicationDomain }`,
                        address: resolve[0].address,
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
            fs.writeFileSync(entryFileName, ini.stringify( entry ))
        }

        return 0;
    }
}