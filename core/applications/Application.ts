import {AnchorMeta, TransactionDirection} from "../anchor/server";
import {Buffer} from "buffer";
import {AppConfig} from "../agent/aio-application-manager";
import Path from "path";
import {FileUtil} from "zoo.util/lib/file-util";

export class Application {
    name:string
    constructor( _module:NodeModule ) {
        let _name = Path.relative( __dirname, _module.id );
        _name = _name.substring(0, _name.length - `app.${Path.extname( _name )}`.length );
        this.name = _name;
    }
    transform( meta:AnchorMeta<any>, data:Buffer, config:AppConfig, direction:TransactionDirection ):Buffer{
        return data
    }
}

export function discoverApplications(){
    let math = /.*.app.js$/;
    let apps:Application[] = [];
    FileUtil.scanFiles( Path.join( __dirname,/*language=file-reference*/ '../applications' ), math, app => {
        let appInflate = require( app.path );
        if( !appInflate ) return;
        if( typeof appInflate["createInstance"] !== "function" ) return;
        apps.push( appInflate["createInstance"]());
    }, { recursive: true });
    return apps;
}