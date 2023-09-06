import * as fs from "fs";
import * as Path from "path";
import ini from "ini";
import {Defaults} from "../core-v2/defaults";

type Result = {
    [p:string]:any;
}
export function loadConfigsFile<T extends Result>( path:string, encoding?: BufferEncoding ):T{
    let result:Result = {
        etc: Defaults.etc
    };
    if( !fs.existsSync( path ) ) return result as T;
    let basetype = Path.extname( path );
    let data = fs.readFileSync( path ).toString( encoding ?? "utf8" );

    let _conf   = () =>{ return ini.parse( data ); }
    let _json   = ()=>{ return JSON.parse( data ); }
    let _js     = ()=>{ return require( path );}

    let parser:CallableFunction;

    if( [".conf", ".ini", ".env" ].includes( basetype )) parser = _conf;
    else if( [ ".json" ] ) parser = _json;
    else if( [ ".js" ] ) parser = _js;

    try {
        let next = parser();
        // while ( next && typeof next === "object" && section.length ) {
        //     next = next[ section.shift() ];
        // }
        if( next && typeof next === "object" ) return next;
    } catch (e){}
    return {} as T
}