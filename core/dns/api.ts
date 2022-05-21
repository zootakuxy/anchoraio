import {AgentOpts} from "../agent/opts";
import express from "express";
import * as http from "http";
import {aioResolve} from "./aio.resolve";
import {Agent} from "../agent";



export function startAPI( agentOpts:AgentOpts, agent:Agent){
    let app = express();
    const bodyParser = require( 'body-parser' );
    app.use( bodyParser.json( { } ) );
    app.use( bodyParser.urlencoded({ extended: true }));
    app.use( bodyParser.raw({ } ) );
    app.use( bodyParser.text( { } ) );

    app.get( "/api/agent/:identifier", (req, res) => {
        let agentIdentifier = req.params.identifier;
        let _agent = aioResolve.createAgent( agentIdentifier );

        return res.json( { success: !!_agent && _agent?.identifier && _agent?.name, data: Object.assign({}, _agent, { match:_agent?.match?.source}) } );
    });

    app.get( "/api/app/:application", (req, res, next) => {
        let application = req.params.application;
        let _app = require("../agent/apps" ).getApplication( application );
        if( !_app ) return res.json( { success:false });
        else return res.json( { success: true, data: _app } );
    });

    app.post( "/api/app/:application", (req, res, next) => {
        let application = req.params.application;
        let app = req.body;
        console.log( `[ANCHORAIO] Create application`, application, "with", app );
        let _app = require("../agent/apps" ).createApplication( application, app );
        if( !_app ) return res.json( { success:false });
        else return res.json( { success: true, data: _app } );
    });

    app.get( "/api/domain/:server", (req, res, next) => {
        let server = req.params.server;
        let answer =  aioResolve.aioResolve( server );
        return res.json( { success:!!answer && answer?.length> 0 , data: answer });
    });

    app.get( "/api/address/:address", (req, res, next) => {
        let address = req.params.address;
        let resolved = aioResolve.serverName( address );
        return res.json( { success: !!resolved && resolved?.address && resolved?.answer?.length > 0, data: resolved })
    });

    app.get( "/api/status", (req, res, next) => {
        return res.json( { success: true, data: {
            connected: agent.isConnected,
            domain: agent.identifier,
            port: agentOpts.agentPort,
            serverHost: agentOpts.serverHost,
            serverPort: agentOpts.serverPort,
            serverConnection: agent.id,
        }})
    });

    let server = http.createServer({}, app );
    server.listen( agentOpts.agentAPI );

    return server;
}