import * as fs from "fs";
import {configs} from "./configs";
import * as path from "path";
import ini from "ini";
import net from "net";

let exists = fs.existsSync( path.join( configs.etc, "apps.conf" ));
export const apps:{ apps:{ [p:string]:string|number|{
    port:number|string
    address?:string
}}} = exists ? ini.parse( fs.readFileSync( path.join( configs.etc, "apps.conf" )).toString("utf8") ) as any: { apps: {} };



export function createApp( application:string|number ){
    if( !application ) application = "default";
    let app:any = apps[ application ];

    if( typeof app === "string" || typeof app === "number" ){
        application = app;
        app = null;
    }
    let connection :net.Socket;
    if( app ){
        connection = net.createConnection({
            host: app.address||"127.0.0.1",
            port: app.port
        });
        connection.on( "error", err => {
            console.error( "server:error", err.message )
        });
    }
    return connection;
}
