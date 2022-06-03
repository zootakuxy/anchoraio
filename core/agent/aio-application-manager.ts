import * as fs from "fs";
import * as path from "path";
import ini from "ini";
import {nanoid} from "nanoid";
import {AgentRequest, AioAgent} from "./aio-agent";
import {AioSocket} from "../aio/socket";
import {aio} from "../aio/aio";
import {AioHeader} from "../global/share";
import {AioType, AnchorMeta} from "../aio/anchor-server";

export type Application = {
    port:number|string
    address?:string
}

export class AioAplicationManager {
    apps:{ apps:{ [p:string]:string|number|Application } };
    agent:AioAgent
    seq:number = 0;

    constructor( agent:AioAgent ) {
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

    } connectApplication( args:AioHeader ):AioSocket<AnchorMeta<AgentRequest>>{
        let application = this.getApplication( args.application );
        let connection:AioSocket<AnchorMeta<AgentRequest>>;

        if( application ){
            let resolverId = `resolver://${this.agent.identifier}/${nanoid( 16)}?${ this.seq++ }`;
            connection = aio.connect({
                host: application.address||"127.0.0.1",
                port: Number( application.port ),
                listenEvent: false,
                id: resolverId,
                isConnected: false
            });

            connection.on( "error", err => {
                console.error( "[ANCHORIO] Agent>", `Application Connection error ${ err.message }` )
            });
            connection = this.agent.anchorServer.register( connection, { anchorPoint: "SERVER" } );
            this.agent.anchorServer.auth( {
                aioType: AioType.AIO_OUT,
                anchors: [ connection.id ],
                busy: connection.id,
                origin: this.agent.identifier,
                needOpts:{}
            }, this.agent.connect.id, { onError: "END", name: "SERVER"} )
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

