import {AgentOpts} from "../../agent/opts";
import {Agent} from "../../agent";
import chalk from "chalk";
import {AgentAPI} from "../../dns/api";
import {AgentDNS} from "../../dns/server";

export class AgentContext {
    agent:Agent
    options:AgentOpts
    agentDNS:AgentDNS
    agentApi:AgentAPI

    constructor( agentOpts:AgentOpts ) {
        this.options = agentOpts;
    }

    public start(){
        this.start = ()=>{
            console.log( "Function already started!" );
        }

        let agent = new Agent( this.options, this );
        this.agent = agent;

        if( agent.opts.selfServer ){
            agent.opts.serverHost = "127.0.0.1"
            require('../server' ).default( this.options );
        }

        agent.connect().then( value => {
            console.log( "[ANCHORIO] Agent>", chalk.greenBright( `Connected to server on ${agent.opts.serverHost}:${String( agent.opts.serverPort )}` ) );
            agent.localListener.createServer().then( value1 => {});
        });

        console.log( "scs s cscsc")

        if( !agent.opts.noDNS ) {
            this.agentDNS = new AgentDNS( agent );
        }

        if( !agent.opts.noAPI ){
            this.agentApi = new AgentAPI( agent );
        }
    }
}