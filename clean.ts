// @ts-ignore
import {FileUtil} from "zoo.util/lib/file-util";
import path from "path";
import fs from "fs";
import * as child_process from "child_process";
import Path from "path";

export function cleanJs( dirname ){
    //language=file-reference
    if( !dirname ) dirname = process.cwd();
    [
        { basename: /*language=file-reference*/ "/aio", math: /.*.js$/, },
        { basename: /*language=file-reference*/ "/core-v2", math: /.*.js.map$/, }

    ].forEach( (value, index) => {
        FileUtil.scanFiles( path.join( dirname, value.basename ), value.math, path1 => {
            if( path1.path === __filename ) return;
            console.log( "unlink", path1.url.href, "..." );
            fs.unlinkSync( path1.path );
        }, { recursive: true });
    })
}

if( require.main.filename === __filename ){
    //language=file-reference
    // cleanJs( process.cwd() );
    // child_process.spawn( "tsc.cmd", {
    // //language=file-reference
    //     cwd: Path.join( __dirname, "./" )
    // })
}
