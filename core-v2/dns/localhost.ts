import * as fs from "fs";
import * as path from "path";
import * as ini from "ini";
import { Addr } from 'netaddr';

export const FIRST_ADDRESS = "127.100.0.1";

export type LocalhostOptions  = {
    etc
}
export class Localhost {
    _next:Addr;
    opts:LocalhostOptions;

    private readonly _status:{ localhost?:{ init?:string, last?:string}};

    constructor( opts:LocalhostOptions ) {
        this.opts = opts;
        console.log([ this.opts, "localhost.conf" ])
        let existsLocalhost =  fs.existsSync( path.join( this.opts.etc, "localhost.conf" ));
        this._status = existsLocalhost? ini.parse( fs.readFileSync( path.join( this.opts.etc, "localhost.conf" ) ).toString() ): { localhost:{} };

        let next;
        if( !this._status.localhost ) this._status.localhost = {};
        if( !this._status.localhost.init ) this._status.localhost.init = FIRST_ADDRESS;
        if( !this._status.localhost.last ){
            next = this._status.localhost.init;
            this._status.localhost.last = this._status.localhost.init;
        }
        else next = Addr( this._status.localhost.last ).increment().octets.join(".");
        this._next = Addr( next );
    }
    next():string{
        let _next = this.current();
        this._next = this._next.increment();
        this._status.localhost.last = _next;

        console.info( this._status )
        fs.writeFileSync( path.join( this.opts.etc, "localhost.conf" ), ini.stringify( this._status ));
        return _next;
    }
    current():string{
        return  this._next.octets.join(".");
    }
}