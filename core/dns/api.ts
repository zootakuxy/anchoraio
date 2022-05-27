import express, {Express} from "express";
import * as http from "http";
import  chalk from "chalk";
import {Agent} from "../agent";


export class AgentAPI {

    agent:Agent
    app:Express;
    server:http.Server

    constructor( agent:Agent ){
        this.agent = agent;
        this.app = express();
        const bodyParser = require( 'body-parser' );
        this.app.use( bodyParser.json( { } ) );
        this.app.use( bodyParser.urlencoded({ extended: true }));
        this.app.use( bodyParser.raw({ } ) );
        this.app.use( bodyParser.text( { } ) );

        this.app.get( "/api/agent/:identifier", (req, res) => {
            let agentIdentifier = req.params.identifier;
            console.log( "[ANCHORIO] Agent> API>", `GET /api/agent/${ agentIdentifier }`);

            let _agent = this.agent.aioResolve.createAgent( agentIdentifier );

            return res.json( { success: !!_agent && _agent?.identifier && _agent?.name, data: Object.assign({}, _agent, { match:_agent?.match?.source}) } );
        });

        this.app.get( "/api/app/:application", (req, res, next) => {
            let application = req.params.application;
            let _app = this.agent.appManager.getApplication( application );
            console.log( "[ANCHORIO] Agent> API>", `GET /api/application/${ application }`);
            if( !_app ) return res.json( { success:false });
            else return res.json( { success: true, data: _app } );
        });

        this.app.post( "/api/app/:application", (req, res, next) => {
            let application = req.params.application;
            let app = req.body;
            console.log( "[ANCHORIO] Agent> API>", `POST /api/application/${ application }`);
            let _app = this.agent.appManager.registerApplication( application, app );
            if( !_app ) return res.json( { success:false });
            else return res.json( { success: true, data: _app } );
        });

        this.app.get( "/api/domain/:server", (req, res, next) => {
            let server = req.params.server;
            let answer =  this.agent.aioResolve.aioResolve( server );
            console.log( "[ANCHORIO] Agent> API>", `GET /api/domain/${ server }`);
            return res.json( { success:!!answer && answer?.length> 0 , data: answer });
        });

        this.app.get( "/api/address/:address", (req, res, next) => {
            let address = req.params.address;
            console.log( "[ANCHORIO] Agent> API>", `GET /api/address/${ address }`);

            let resolved = this.agent.aioResolve.serverName( address );
            return res.json( { success: !!resolved && resolved?.address && resolved?.answer?.length > 0, data: resolved })
        });

        this.app.get( "/api/status", (req, res, next) => {
            console.log( "[ANCHORIO] Agent> API>", `GET /api/status`);

            return res.json( { success: true, data: {
                connected: agent.isConnected,
                domain: agent.identifier,
                port: agent.opts.agentPort,
                serverHost: agent.opts.serverHost,
                serverPort: agent.opts.serverPort,
                serverConnection: agent.id,
            }})
        });

        this.app.get( "/api/ports", (req, res, next) => {
            console.log( "[ANCHORIO] Agent> API>", `GET /api/ports`);


            let ports:number[] = req.body?.ports || [];

            let news = [];
            agent.agentPorts.forEach( nextPort =>{
                if( !ports.includes( nextPort ) ) news.push( nextPort );
            });

            let use = news.shift();
            if( use ) return res.json( {
                success: true,
                data: {
                    port: use,
                    ports: agent.agentPorts
                }
            });

            agent.localListener.createServer().then( value => {
                res.json({ success: !!value, data: { port: value, ports:agent.agentPorts } } );
            })
        });

        this.server = http.createServer({}, this.app );
        this.server.listen( agent.opts.agentAPI, ()=>{
            console.log( "[ANCHORIO] Agent>", chalk.greenBright(`Running Agent API ${ agent.identifier } on port ${ agent.opts.agentAPI }`) );
        } );

    }

}