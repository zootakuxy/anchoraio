import {ResolveOptions} from "../../../aio/opts/opts-resolve";
import {AioResolver, Resolved} from "../../agent/resolve";
import fs from "fs";
import Path from "path";
import ini from "ini";
import unorm from "unorm";


function normalize(texto) {
    // Substitui acentos
    const normalized = unorm.nfkd(texto);
    const noAccent = normalized.replace(/[\u0300-\u036F]/g, '');
    // Substitui caracteres inválidos
    return noAccent.replace(/[^a-zA-Z0-9\-_.]/g, '_');
}


export class ResolveService {

    private resolver:AioResolver;
    opts:ResolveOptions
    constructor( opts:ResolveOptions ) {
        this.resolver = new AioResolver({
            etc: opts.etc,
            getawayRelease: opts.getawayRelease,
            getawayReleaseTimeout: opts.getawayReleaseTimeout,
            requestTimeout: opts.requestTimeout,
            getawayReleaseOnDiscover: opts.getawayReleaseOnDiscover
        });
        this.opts = opts;
    }
    start():number{
        let resolve = this.resolver.aioResolve( this.opts.aioApplicationDomain );
        if( !resolve || this.opts.action === "sets" ) resolve = this.sets( resolve );
        if( !resolve ) return  -1;


        if( this.opts?.noPortDomain && Array.isArray(this.opts.noPortDomain )){
            this.opts.noPortDomain = this.opts.noPortDomain
                .filter( value => {
                    if( !value ) return false;
                    return value.trim().length;
                })
                .map( value => {
                return value.trim();
            })
        }

        if( resolve.linkedHosts && resolve.linkedReference ) this.link( resolve );

        this.show( resolve );
        return 0;
    }

    public sets( resolve:Resolved ){
        let linked = ( address:string ) => {
            if( this.opts.noPortDomain && this.opts.noPortEntry ){
                let entryName = `${normalize(this.opts.noPortDomain[0])}_${address}`;
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
        return resolve;
    }

    public link( resolve: Resolved ){
        let agentServer = this.resolver.serverOf( resolve.aioHost );
        let noPortEntry = {
            entry:{
                [ `${agentServer.name}_aio` ]:{
                    host:this.opts.noPortDomain,
                    name: this.opts.aioApplicationDomain,
                    description: `Aio entry domain for ${ this.opts.aioApplicationDomain }`,
                    address: resolve.address,
                    port: this.opts.anchorPort,
                    protocol: resolve.protocol||"http",
                    disable: false,
                    opts: { }
                }
            }
        }

        if( fs.existsSync( resolve.linkedReference ) ){
            let old = ini.parse( fs.readFileSync( resolve.linkedReference ).toString() )||{};
            noPortEntry = Object.assign( old, noPortEntry );
        }

        if( !fs.existsSync( Path.dirname( resolve.linkedReference ) ) ) fs.mkdirSync( Path.dirname( resolve.linkedReference ), {
            recursive: true
        });
        fs.writeFileSync( resolve.linkedReference, ini.stringify( noPortEntry, { whitespace: true } ));
    }

    private show( resolve:Resolved ){
        let _labels:({key:string,value:any})[] = [];
        let maxLabel = 0, maxValue = 0;
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
        label( "AIOHOST", resolve.address );
        label( "GETAWAY-RELEASE", resolve.getawayRelease );
        label( "GETAWAY-RELEASE-TIMEOUT", resolve.getawayReleaseTimeout );
        label( "FILE", resolve.reference );
        label( "LINKED NO-PORT" );
        label( "NOPORT DOMAIN:", resolve.linkedHosts );
        label( "PORT:", this.opts.anchorPort );
        label( "FILE:", resolve.linkedReference );

        let self = this;
        let show :{ [k in typeof self.opts.format]?:()=>void}= {
            label(){
                _labels.forEach( value => {
                    if( !value.value ){
                        console.log( ((value.key+" ").padEnd(maxLabel+1, "="))+("".padEnd( maxValue+1, "=")) );
                        return;
                    }
                    console.log( value.key.padEnd(maxLabel+1, " "), ((value.value||"")+"").padEnd( maxValue, " " ));
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

                if( resolve.linkedReference && fs.existsSync( resolve.linkedReference )) {
                    console.log( fs.readFileSync( resolve.linkedReference ).toString() )
                }
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
    }
}