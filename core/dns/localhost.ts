import * as fs from "fs";
import * as path from "path";
import * as ini from "ini";
import { Addr } from 'netaddr';
import {agentOptions} from "../agent/opts";

const agentOpts = agentOptions();

let existsLocalhost =  fs.existsSync( path.join(agentOpts.etc, "localhost.conf" ));
const status:{
    localhost?:{
        init?:string,
        last?:string
    }
} = existsLocalhost? ini.parse( fs.readFileSync( path.join(agentOpts.etc, "localhost.conf" ) ).toString() ): { localhost:{} };

let next;
if( !status.localhost ) status.localhost = {};
if( !status.localhost.init ) status.localhost.init = "127.100.0.1";
if( !status.localhost.last ){
    next = status.localhost.init;
    status.localhost.last = status.localhost.init;
}
else next = Addr( status.localhost.last ).increment().octets.join(".");

export const localhost = new class Localhost {
    _next;
    constructor( next ) {
        this._next = next;
    }
    next():string{
        let _next = this.current();
        this._next = this._next.increment();
        status.localhost.last = _next;
        fs.writeFile( path.join(agentOpts.etc, "localhost.conf" ), ini.stringify( status ), ()=>{});
        return _next;
    }
    current():string{
        return  this._next.octets.join(".");
    }
}( Addr( next ) )