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
        //1 -> Host: ${hostname}
        //8 ->
        let lines:string[] = raw.split( "\n" );

        let host = ( line:string )=>{
            let parts = line.split( "Host: ");
            if( parts.length === 2 ) return `Host: localhost`;
        }

        raw = lines.map( value => {
            let replace = host( value );
            return replace || value;
        }).join( "\n" );

        // console.log( data.toString() );
        return null
    }
}

export function createInstance(){
    return new HttpApp()
}