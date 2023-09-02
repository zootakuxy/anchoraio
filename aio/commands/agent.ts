import yargs, {BuilderCallback} from "yargs";
import {AgentLauncherOptions, agentOptsBuilder} from "../opts/opts-agent";
import {aioOpts} from "../opts/opts";

export const command = "agent";
export const desc:string = "Start agentProxy service";

export const builder:BuilderCallback<AgentLauncherOptions, any> = yargs => {
    return aioOpts(agentOptsBuilder( yargs ), values => {
        return Object.assign({}, values?.agent || {} );
    });
};
export const handler = function ( argv: yargs.Arguments<AgentLauncherOptions> ) {
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
    const { AgentAio } = require("../../core-v2/agent/agent-aio");
    let aio = new AgentAio(argv);
    aio.start();

    // const { AgentContext } = require( "../../core/agentProxy/agentProxy-context" );
    // new AgentContext( argv ).start();
}
