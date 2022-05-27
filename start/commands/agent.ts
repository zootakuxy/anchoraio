import yargs, {BuilderCallback} from "yargs";
import { AgentOpts, agentOptsBuilder} from "../../core/agent/opts";
import {globalOptsBuilder} from "../../core/global/opts";

export const command = "agent";
export const desc:string = "Start agent service";

export const builder:BuilderCallback<AgentOpts, any> = yargs => {
    return globalOptsBuilder(agentOptsBuilder( yargs ), values => {
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
    const { AgentContext } = require( "../../core/service/agent.service" );
    new AgentContext( argv ).start();
}
