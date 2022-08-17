import {Application} from "./Application";
import {Buffer} from "buffer";
import {AppConfig} from "../agent/aio-application-manager";
import {TransactionDirection} from "../anchor/server";

export interface HttpProperties {
    rewriter?:{
        host?:string,
        path?:string
    }
}

export class HttpApp extends Application{

    constructor() {
        super(module);
    }

    transform( meta, data:Buffer, config:AppConfig, direction:TransactionDirection ){
        if( meta.side !== "ConnectionSide::CLIENT_SIDE" ) return;

        let raw = data.toString();
        console.log( raw )
        //1 -> Host: ${hostname}
        //8 ->
        let lines:string[] = raw.split( "\n" );
        let _host;

        let host = ( line:string )=>{
            let parts = line.split( "Host: ");
            if( parts.length !== 2 ) return null;
            console.log( parts )
            _host = parts[1];
            return  `Host: localhost:16519`;
        }

        let referer = ( line:string )=>{
            let parts = line.split( "Referer: ");
            console.log( { _host })
            if( parts.length !==2 ) return null;
            return `Referer: ${parts[1].replace( 'localhost:36900', 'localhost:16519' )}`
        }

        raw = lines.map( value => {
            let replace = host( value );
            if( !replace && _host ) replace = referer( value );
            if( replace ) console.log( "HeaderReplace", replace )
            return replace || value;
        }).join( "\n" );

        console.log( raw );
        return Buffer.from( raw )
    }
}

export function createInstance(){
    return new HttpApp()
}