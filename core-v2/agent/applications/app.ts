import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import {AgentAio} from "../agent-aio";
import {BaseEventEmitter, iniutil} from "kitres";
import {AppProtocol} from "../../protocol";
import Path from "path";

export type App = {
    port:number
    name:string,
    address?:string,
    reference?:string
    releases?:any,
    protocol?:AppProtocol
    grants?:string[]
}


interface ApplicationListener {
    sets(app:App, old?:App )
    delete( app:App )
}

export class ApplicationAIO  extends BaseEventEmitter<ApplicationListener>{
    appsConf:{ apps:{ [ p:string ]:App } };
    agent:AgentAio
    seq:number = 0;
    fileConf:string;

    constructor( agent:AgentAio ) {
        super();
        this.agent = agent;
        this.fileConf = path.join( agent.opts.etc, "apps.conf" );

        if( !fs.existsSync( this.fileConf )) {
            if( !fs.existsSync( Path.dirname( this.fileConf ) ) ) fs.mkdirSync( Path.dirname( this.fileConf ), { recursive: true });
            fs.writeFileSync( this.fileConf, iniutil.identity(
                ini.stringify({ apps:{} }, { whitespace: true })
            ))
        }
        this.appsConf = ini.parse( fs.readFileSync( path.join( agent.opts.etc, "apps.conf" )).toString("utf8") ) as any;
    }
    getApplication( application:string ){
        if( !application ) application = "default";
        if( !this.appsConf ) this.appsConf = { apps:{} };
        if( !this.appsConf.apps ) this.appsConf.apps = {};
        let app:App = this.appsConf.apps[ application ];
        if( !app ) return null;

        if( !app.port || !Number.isSafeInteger(Number( app.port ))) return null;
        if( !app.address ) app.address = "127.0.0.1";
        app.name = application;
        return app;
    }

    applications():App[]{
        if( !this.appsConf ) this.appsConf = { apps: {} };
        if( !this.appsConf.apps ) this.appsConf.apps = {};
        return Object.keys( this.appsConf.apps ).map( name => {
            return this.getApplication( name )
        });
    }

    deleteApplication( application:string ){
        let app = this.getApplication( application );
        if( !app ) return {
            result: false,
            message: "Application does not exists"
        }

        delete this.appsConf.apps[application];
        this.saveChange();
        this.notify( "delete", app );
        return  {
            result: true,
            message: `Application ${ app.name } deleted success!`,
            app: app
        }
    }

    setApplication ( app:App ){
        if( !app.port ) return {
            result:false,
            message: "Missing application port"
        };

        if( !app.port || !Number.isSafeInteger(Number( app.port ))) return {
            result: false,
            message: "Invalid application port"
        };

        if( !app.name || !app.name.length ) return  {
            result: false,
            message: "Missing or invalid application name!"
        };

        let old = this.getApplication( app.name );

        this.appsConf.apps[ app.name ] = app;
        this.saveChange()

        this.notify( "sets", app, old );
        return {
            result: true,
            message: "success",
            app: app
        };
    }

    private saveChange(){
        fs.writeFileSync(
            this.fileConf,
            iniutil.identity(
                ini.stringify( this.appsConf,  { whitespace: true })
            )
        );
    }
}
