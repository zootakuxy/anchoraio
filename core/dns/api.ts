import express, {Express} from "express";
import * as http from "http";
import  chalk from "chalk";
import {AgentContext} from "../agent/agent-context";
import {Status} from "../utils/status";


export class AgentAPI {

    context:AgentContext
    app:Express;
    server:http.Server;
    _status:Status;

    constructor( context:AgentContext ){
        this.context = context;
        this._status = new Status();
        this.app = express();
        const bodyParser = require( 'body-parser' );
        this.app.use( bodyParser.json( { } ) );
        this.app.use( bodyParser.urlencoded({ extended: true }));
        this.app.use( bodyParser.raw({ } ) );
        this.app.use( bodyParser.text( { } ) );

        this.app.get( "/api/app/:application", (req, res, next) => {
            let application = req.params.application;
            let _app = this.context.agent.appManager.getApplication( application  );
            console.log( "[ANCHORIO] Agent> API>", `GET /api/application/${ application }`);
            if( !_app ) return res.json( { success:false });
            else return res.json( { success: true, data: _app } );
        });

        this.app.post( "/api/app/:application", (req, res, next) => {
            let application = req.params.application;
            let app = req.body;
            console.log( "[ANCHORIO] Agent> API>", `POST /api/application/${ application }`);
            let _app = this.context.agent.appManager.registerApplication( application, app );
            if( !_app ) return res.json( { success:false });
            else return res.json( { success: true, data: _app } );
        });

        this.app.get( "/api/domain/:server", (req, res, next) => {
            let server = req.params.server;
            let answer =  this.context.agent.aioResolve.aioResolve( server );
            console.log( "[ANCHORIO] Agent> API>", `GET /api/domain/${ server }`);
            return res.json( { success:!!answer && answer?.length> 0 , data: answer });
        });

        this.app.get( "/api/address/:address", (req, res, next) => {
            let address = req.params.address;
            console.log( "[ANCHORIO] Agent> API>", `GET /api/address/${ address }`);

            let resolved = this.context.agent.aioResolve.resolved( address );
            return res.json( { success: !!resolved && resolved?.address, data: resolved })
        });

        this.app.get( "/api/status", (req, res, next) => {
            console.log( "[ANCHORIO] Agent> API>", `GET /api/status`);

            return res.json( { success: true, data: {
                connected: this.context.agent.isConnected,
                domain: this.context.agent.identifier,
                port: this.context.options.agentPort,
                serverHost: this.context.options.serverHost,
                serverPort: this.context.options.serverPort,
                serverConnection: this.context.agent.connect.id,
            }})
        });

        this.server = http.createServer({}, this.app );
        this._init()
    }

    private _init(){

        if( !this.context.options.noAPI ){
            this.context.listener.on( "context.start", any => {
                return this._status.start( () => {
                    return new Promise( resolve => {
                        this.server.listen( this.context.options.agentAPI, ()=>{
                            console.log( "[ANCHORIO] Agent>", `Running Agent API ${ this.context.options.identifier } on port ${ chalk.greenBright(String(this.context.options.agentAPI)) }` );
                            resolve( true );
                        });
                    })
                });
            });

            this.context.listener.on( "context.stop", any => {
                return this._status.stop( () => {
                    return new Promise( resolve => {
                        this.server.close( err =>  { resolve( true ) });
                    })
                })
            });
        }
    }

}