import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import {nanoid} from "nanoid";
import {AgentRequest, AioAgent} from "./aio-agent";
import {AioSocket} from "../socket/socket";
import {aio} from "../socket/aio";
import {AioType, AnchorMeta, TransactionDirection} from "../anchor/server";
import {SIMPLE_HEADER} from "../anchor/share";
import {Buffer} from "buffer";
import {Application, discoverApplications} from "../applications/Application";
import Path from "path";
import {FileUtil} from "zoo.util/lib/file-util";


export type AppConfig = {
    port:number|string
    name:string|number,
    address?:string,
    reference?:string
    transform?:any

}

export class AioApplicationManager {
    appsConf:{ apps:{ [p:string]:string|number|AppConfig } };
    agent:AioAgent
    seq:number = 0;

    private applications: Application[] = [];

    constructor( agent:AioAgent ) {
        this.agent = agent;
        let exists = fs.existsSync( path.join( agent.opts.etc, "apps.conf" ));
        this.appsConf = exists ? ini.parse( fs.readFileSync( path.join( agent.opts.etc, "apps.conf" )).toString("utf8") ) as any: { apps: {} };
        this.applications.push( ...discoverApplications() );


    }  registerApplication (application, app:string|number|{ port:number, host?:string }):AppConfig|string|number{
        if( !application ) application = "default";
        let _app:AppConfig|string|number = this.appsConf.apps[ application ];
        if( !_app && app ){
            // @ts-ignore
            _app = app
            this.appsConf.apps[ application ] = _app;
            fs.writeFile( path.join( this.agent.opts.etc, "apps.conf" ), ini.stringify( this.appsConf, {
                whitespace: true
            }), ()=>{})
        }
        return _app;

    } connectApplication( args:typeof SIMPLE_HEADER.aio ):AioSocket<AnchorMeta<AgentRequest>> {
        let application = this.getApplication(args.application);
        let connection: AioSocket<AnchorMeta<AgentRequest>>;

        if (application) {
            let resolverId = `resolver://${this.agent.identifier}/${nanoid(16)}?${this.seq++}`;
            connection = aio.connect({
                host: application.address || "127.0.0.1",
                port: Number(application.port),
                listenEvent: false,
                id: resolverId,
                isConnected: false
            });

            connection.on("error", err => {
                console.error("[ANCHORIO] Agent>", `Application Connection error ${err.message}`)
            });
            connection = this.agent.anchorServer.register(connection, {anchorPoint: "SERVER"});
            this.agent.anchorServer.auth({
                aioType: AioType.AIO_OUT,
                anchors: [connection.id],
                busy: connection.id,
                origin: this.agent.identifier,
                needOpts: {}
            }, this.agent.connect.id, {onError: "END", name: "SERVER"})
        }
        return connection;



    } getApplication( application:string|number ){
        if( !application ) application = "default";
        let app:AppConfig|string|number = this.appsConf.apps[ application ];
        let _app:AppConfig;

        if( app && typeof app === "object" && Number.isSafeInteger(Number( app.port )) ){
            _app = app;
        } else if( (typeof app === "string" || typeof app === "number" ) && Number.isSafeInteger( Number( app ))){
            _app = {
                port: Number( app ),
                address: "127.0.0.1",
                name: application
            }
        } else if(  typeof app === "string" || typeof app === "number" ) _app = null;
        return _app;

    } transform( meta:AnchorMeta<any>, data:Buffer, direction:TransactionDirection ):Buffer{
        // if( direction === TransactionDirection.CLIENT_TO_SERVER ) console.log({meta, data, direction});

        if( !meta?.appConf?.reference ) return data;
        let application = this.applications.find( value => !!value.name
            && value.name === meta.appConf.reference
        );
        if( !application ) return data;

        let transform = application.transform( meta, data, meta.appConf, direction );
        if( !!transform ) data = transform;
        return data;
    }
}

