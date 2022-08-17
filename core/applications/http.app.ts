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
        let lines = raw.split( "\n" );

        console.log( lines[1].split("Host: ")[1] )
        if( meta.side === "ConnectionSide::CLIENT_SIDE" ) console.log( raw );

        return data;
    }
}

export function createInstance(){
    return new HttpApp()
}