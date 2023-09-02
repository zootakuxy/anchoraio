import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import {AgentAio} from "../agent/agent-aio";
import {BaseEventEmitter} from "kitres/src/core/util";

export type App = {
    port:number
    name:string|number,
    address?:string,
    reference?:string
    releases?:any

}


interface ApplicationListener {
    register( app:App )
}

export class ApplicationAIO  extends BaseEventEmitter<ApplicationListener>{
    appsConf:{ apps:{ [p:string]:string|number|App } };
    agent:AgentAio
    seq:number = 0;

    constructor( agent:AgentAio ) {
        super();
        this.agent = agent;
        let exists = fs.existsSync( path.join( agent.opts.etc, "apps.conf" ));
        this.appsConf = exists ? ini.parse( fs.readFileSync( path.join( agent.opts.etc, "apps.conf" )).toString("utf8") ) as any: { apps: {} };
    }
    getApplication( application:string|number ){
        if( !application ) application = "default";
        let app:App|string|number = this.appsConf.apps[ application ];
        let _app:App;

        if( app && typeof app === "object" && Number.isSafeInteger(Number( app.port )) ){
            _app = app;
        } else if( (typeof app === "string" || typeof app === "number" ) && Number.isSafeInteger( Number( app ))){
            _app = {
                port: Number( app ),
                address: "127.0.0.1",
                name: application
            }
        } else if(  typeof app === "string" || typeof app === "number" ) _app = null;

        if(!!_app) _app.name = application;
        if( !!_app && !_app.address ) _app.address = "127.0.0.1";

        return _app;
    }

    applications():App[]{
        return Object.keys( this.appsConf.apps ).map( name => {
            return this.getApplication( name )
        });
    }

    registerApplication (application, app:string|number|{ port:number, host?:string }):App{
        if( !application ) application = "default";
        let _app:App|string|number = this.appsConf.apps[ application ];
        if( !_app && app ){
            // @ts-ignore
            _app = app
            this.appsConf.apps[ application ] = _app;
            fs.writeFile( path.join( this.agent.opts.etc, "apps.conf.sample" ), ini.stringify( this.appsConf, {
                whitespace: true
            }), ()=>{})
        }
        let regApp:App = this.getApplication( application );
        this.notify( "register", regApp );
        return regApp;
    }
}
