import {AgentOpts} from "../../agent/opts";
import {Agent} from "../../agent";
import chalk from "chalk";
import {AgentAPI} from "../../dns/api";
import {AgentDNS} from "../../dns/server";

export const agentService = new (class AgentService{
    agent:Agent
    options:AgentOpts
    agentDNS:AgentDNS
    agentApi:AgentAPI
})();

export default function ( agentOpts:AgentOpts ){
    let agent = new Agent( agentOpts );
    agentService.options = agentOpts;
    agentService.agent = agent;

    if( agentOpts.selfServer ){
        agentOpts.serverHost = "127.0.0.1"
        require('../server' ).default( agentOpts );
    }

    agentService.agent.connect().then( value => {
        console.log( "[ANCHORIO] Agent>", chalk.greenBright( `Connected to server on ${agentOpts.serverHost}:${String( agentOpts.serverPort )}` ) );
        agent.localListener.createServer().then( value1 => {});
    });

    if( !agentOpts.noDNS ) {
        agentService.agentDNS = new AgentDNS( agent );
    }

    if( !agentOpts.noAPI ){
        agentService.agentApi = new AgentAPI( agent );
    }
}