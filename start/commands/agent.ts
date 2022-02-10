import yargs, {BuilderCallback} from "yargs";
import {agentOptions, AgentOpts, agentOptsBuilder} from "../../core/agent/opts";
import {globalOptsBuilder} from "../../core/global/opts";

export const command = "agent";
export const desc:string = "Start agent service";

export const builder:BuilderCallback<AgentOpts, any> = yargs => {
    return globalOptsBuilder(agentOptsBuilder( yargs ), values => {
        return Object.assign({}, values?.agent || {}, values?.dns || { } );
    });
};
export const handler = function ( argv: yargs.Arguments<AgentOpts> ) {
    agentOptions( argv );
    require( "../../core/agent" ).default( argv );
}
