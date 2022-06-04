import {AgentOpts} from "../../agent/opts";
import {AgentAPI} from "../../dns/api";
import {AgentDNS} from "../../dns/server";
import {AioAgent} from "../../agent/aio-agent";

export class AgentContext {
    agent:AioAgent
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

        let agent = new AioAgent( this.options, this );
        this.agent = agent;

        if( agent.opts.selfServer ){
            agent.opts.serverHost = "127.0.0.1"
            const {ServerContext} = require('./../server.service' ) ;
            new ServerContext( agent.opts ).start();
        }

        agent.start();
        // agent.connect().then( value => {
        //     console.log( "[ANCHORIO] Agent>", chalk.greenBright( `Connected to server on ${agent.opts.serverHost}:${String( agent.opts.serverPort )}` ) );
        //     agent.localListener.createServer().then( value1 => {});
        // });

        if( !agent.opts.noDNS ) {
            this.agentDNS = new AgentDNS( agent );
        }

        if( !agent.opts.noAPI ){
            this.agentApi = new AgentAPI( agent );
        }
    }
}