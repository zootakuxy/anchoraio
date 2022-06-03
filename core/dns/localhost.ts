import * as fs from "fs";
import * as path from "path";
import * as ini from "ini";
import { Addr } from 'netaddr';
// import {Agent} from "../agent";
import {AioAgent} from "../agent/aio-agent";



export class Localhost {
    _next:Addr;
    agent:AioAgent;
    private readonly _status:{ localhost?:{ init?:string, last?:string}};

    constructor( agent:AioAgent ) {
        this.agent = agent;

        let existsLocalhost =  fs.existsSync( path.join( this.agent.opts.etc, "localhost.conf" ));
        this._status = existsLocalhost? ini.parse( fs.readFileSync( path.join( this.agent.opts.etc, "localhost.conf" ) ).toString() ): { localhost:{} };

        let next;
        if( !this._status.localhost ) this._status.localhost = {};
        if( !this._status.localhost.init ) this._status.localhost.init = "127.100.0.1";
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
        fs.writeFile( path.join( this.agent.opts.etc, "localhost.conf" ), ini.stringify( this._status ), ()=>{});
        return _next;
    }
    current():string{
        return  this._next.octets.join(".");
    }
}