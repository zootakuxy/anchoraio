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


export function createApplication(application, app:string|number|{ port:number, host?:string }):Application|string|number{
    if( !application ) application = "default";
    let _app:Application|string|number = apps.apps[ application ];
    if( !_app && app ){
        _app = app;
        apps.apps[ application ] = _app;
        fs.writeFile( path.join( agentOptions().etc, "apps.conf" ), ini.stringify( apps, {
            whitespace: true
        }), ()=>{})
    }

    return _app;
}

export function createConnection(application:string|number ){
    let _app = getApplication( application );
    let connection;

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

export function getApplication(application:string|number ){
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
    return _app;
}
