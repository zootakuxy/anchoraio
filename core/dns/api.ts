import {AgentOpts} from "../agent/opts";
import express from "express";
import * as http from "http";
import {aioResolve} from "./aio.resolve";
import {agent as agentCore } from "../agent";


export function startAPI( agentOpts:AgentOpts ){
    let app = express();
    const bodyParser = require( 'body-parser' );
    app.use( bodyParser.json( { } ) );
    app.use( bodyParser.urlencoded({ extended: true }));
    app.use( bodyParser.raw({ } ) );
    app.use( bodyParser.text( { } ) );

    app.get( "/api/agent/:identifier", (req, res) => {
        let agentIdentifier = req.params.identifier;
        console.log( "[ANCHORAIO] Agent> API>", `GET /api/agent/${ agentIdentifier }`);

        let _agent = aioResolve.createAgent( agentIdentifier );

        return res.json( { success: !!_agent && _agent?.identifier && _agent?.name, data: Object.assign({}, _agent, { match:_agent?.match?.source}) } );
    });

    app.get( "/api/app/:application", (req, res, next) => {
        let application = req.params.application;
        let _app = require("../agent/apps" ).getApplication( application );
        console.log( "[ANCHORAIO] Agent> API>", `GET /api/application/${ application }`);
        if( !_app ) return res.json( { success:false });
        else return res.json( { success: true, data: _app } );
    });

    app.post( "/api/app/:application", (req, res, next) => {
        let application = req.params.application;
        let app = req.body;
        console.log( "[ANCHORAIO] Agent> API>", `POST /api/application/${ application }`);
        let _app = require("../agent/apps" ).createApplication( application, app );
        if( !_app ) return res.json( { success:false });
        else return res.json( { success: true, data: _app } );
    });

    app.get( "/api/domain/:server", (req, res, next) => {
        let server = req.params.server;
        let answer =  aioResolve.aioResolve( server );
        console.log( "[ANCHORAIO] Agent> API>", `GET /api/domain/${ server }`);
        return res.json( { success:!!answer && answer?.length> 0 , data: answer });
    });

    app.get( "/api/address/:address", (req, res, next) => {
        let address = req.params.address;
        console.log( "[ANCHORAIO] Agent> API>", `GET /api/address/${ address }`);

        let resolved = aioResolve.serverName( address );
        return res.json( { success: !!resolved && resolved?.address && resolved?.answer?.length > 0, data: resolved })
    });

    app.get( "/api/status", (req, res, next) => {
        console.log( "[ANCHORAIO] Agent> API>", `GET /api/status`);

        return res.json( { success: true, data: {
            connected: agentCore.isConnected,
            domain: agentCore.identifier,
            port: agentOpts.agentPort,
            serverHost: agentOpts.serverHost,
            serverPort: agentOpts.serverPort,
            serverConnection: agentCore.id,
        }})
    });

    app.get( "/api/ports", (req, res, next) => {
        console.log( "[ANCHORAIO] Agent> API>", `GET /api/ports`);

        let agentCore = require("../agent").agent;

        let ports:number[] = req.body?.ports || [];

        let news = [];
        agentCore.agentPorts.forEach( nextPort =>{
            if( !ports.includes( nextPort ) ) news.push( nextPort );
        });

        let use = news.shift();
        if( use ) return res.json( {
            success: true,
            data: {
                port: use,
                ports: agentCore.agentPorts
            }
        });

        agentCore.createServer().then( value => {
            res.json({ success: !!value, data: { port: value, ports:agentCore.agentPorts } } );
        })
    });

    let server = http.createServer({}, app );
    server.listen( agentOpts.agentAPI );

    return server;
}