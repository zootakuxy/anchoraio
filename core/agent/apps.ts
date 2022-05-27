import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import net from "net";
import {Agent} from "./index";

export type Application = {
    port:number|string
    address?:string
}

export class ApplicationManager {
    apps:{ apps:{ [p:string]:string|number|Application } };
    agent:Agent

    constructor( agent:Agent ) {
        this.agent = agent;
        let exists = fs.existsSync( path.join( agent.opts.etc, "apps.conf" ));
        this.apps = exists ? ini.parse( fs.readFileSync( path.join( agent.opts.etc, "apps.conf" )).toString("utf8") ) as any: { apps: {} };

    }  registerApplication (application, app:string|number|{ port:number, host?:string }):Application|string|number{
        if( !application ) application = "default";
        let _app:Application|string|number = this.apps.apps[ application ];
        if( !_app && app ){
            _app = app;
            this.apps.apps[ application ] = _app;
            fs.writeFile( path.join( this.agent.opts.etc, "apps.conf" ), ini.stringify( this.apps, {
                whitespace: true
            }), ()=>{})
        }
        return _app;

    } connectApplication(application:string|number ){
        let _app = this.getApplication( application );
        let connection:net.Socket;

        if( _app ){
            connection = net.createConnection({
                host: _app.address||"127.0.0.1",
                port: Number( _app.port )
            });

            connection.on( "connect", ()=>{
                connection["connected"] = true;
            });

            connection.on( "close", hadError => {
                connection["connected"] = false;
            });

            connection.on( "error", err => {
                connection["connected"] = false;
                console.error( "[ANCHORIO] Application", `Connection error ${ err.message }` )
            });
        }
        return connection;

    } getApplication(application:string|number ){
        if( !application ) application = "default";
        let app:Application|string|number = this.apps.apps[ application ];
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
}

