import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import net from "net";
import {Agent} from "./index";
import {asAIOSocket, AIOSocket} from "../global/AIOSocket";
import {nanoid} from "nanoid";

export type Application = {
    port:number|string
    address?:string
}

export class ApplicationManager {
    apps:{ apps:{ [p:string]:string|number|Application } };
    agent:Agent
    seq:number = 0;

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

    } connectApplication(application:string|number ):AIOSocket{
        let _app = this.getApplication( application );
        let connection:AIOSocket;

        if( _app ){
            let resolverId = `resolver://${this.agent.identifier}/${nanoid( 16)}?${ this.seq++ }`;
            let socket:net.Socket = net.createConnection({
                host: _app.address||"127.0.0.1",
                port: Number( _app.port )
            });

            connection = asAIOSocket( socket, resolverId );

            socket.on( "connect", ()=>{
                socket["connected"] = true;
            });

            socket.on( "close", hadError => {
                socket["connected"] = false;
            });

            socket.on( "error", err => {
                socket["connected"] = false;
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

