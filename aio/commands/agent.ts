import yargs, {BuilderCallback} from "yargs";
import { AgentOpts, agentOptsBuilder} from "../../core/agent/opts";
import {aioOpts} from "../opts";
import {ServerContext} from "../../core/service/server.service";

export const command = "agent";
export const desc:string = "Start agent service";

export const builder:BuilderCallback<AgentOpts, any> = yargs => {
    return aioOpts(agentOptsBuilder( yargs ), values => {
        return Object.assign({}, values?.agent || {}, values?.dns || { } );
    });
};
export const handler = function ( argv: yargs.Arguments<AgentOpts> ) {
    if( argv.mode === "prod" ){
        process.on( "uncaughtExceptionMonitor", error => {
            // console.error(error.message)
        });
        process.on( "uncaughtException", error => {
            // console.error(error.message)
        });
        process.on( "unhandledRejection", error => {
            // console.error(error)
        });
    }

    if( argv.selfServer ){
        require( "./server").handler( argv );
        argv.serverHost = "127.0.0.1"
    }

    console.log( "[ANCHORIO] Agent>", "Init...");
    const { AgentContext } = require( "../../core/agent/agent-context" );
    new AgentContext( argv ).start();
}
