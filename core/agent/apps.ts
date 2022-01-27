import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import net from "net";
import {agentOptions} from "./opts";

let exists = fs.existsSync( path.join( agentOptions().etc, "apps.conf" ));
export type Application = {
    port:number|string
    address?:string
}

export const apps:{ apps:{ [p:string]:string|number|Application}} = exists ? ini.parse( fs.readFileSync( path.join( agentOptions().etc, "apps.conf" )).toString("utf8") ) as any: { apps: {} };


export function createApp( application:string|number ){
    if( !application ) application = "default";
    let app:Application|string|number = apps.apps[ application ];
    let _app:Application;

    if( app && typeof app === "object" && Number.isSafeInteger(Number( app.port )) ){
        _app = app;
    } else if( (typeof app === "string" || typeof app === "number" ) && Number.isSafeInteger( Number( app ))){
        _app = {
            port: Number( app ),
            address: "127.0.0.1"
        }
    } else if(  typeof app === "string" || typeof app === "number" ) _app = null;

    let connection :net.Socket;
    if( _app ){
        connection = net.createConnection({
            host: _app.address||"127.0.0.1",
            port: Number( _app.port )
        });
        connection.on( "error", err => {
            console.error( "server:error", err.message )
        });
    }
    return connection;
}
