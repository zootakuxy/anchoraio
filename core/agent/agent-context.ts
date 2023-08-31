import {AgentOpts} from "./opts";
import {AgentAPI} from "../dns/api";
import {AgentDNS} from "../dns/server";
import {AioAgent} from "./aio-agent";
import {Listener} from "../utils/listener";
import {Status, StatusLevel} from "../utils/status";

export class AgentContext {
    private _status:Status;
    agent:AioAgent
    options:AgentOpts
    agentDNS:AgentDNS
    agentApi:AgentAPI;
    listener:Listener<string>;

    constructor( agentOpts:AgentOpts ) {
        this.options = agentOpts;
        this._status = new Status();
        this.listener = new Listener<string>();
        this.agent = new AioAgent( this );
        this.agentDNS = new AgentDNS( this );
        this.agentApi = new AgentAPI( this );
    }

    public stop(){
        this._status.stop( () => {
            return this.listener.notifyAll( "context.stop" );
        })
    }

    public start(){
        return this._status.start( () => {
            return  this.listener.notifyAll( "context.start" );
        });
    }


    get status(): StatusLevel {
        return this._status.status;
    }
}