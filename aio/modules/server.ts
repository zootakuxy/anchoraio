import yargs, {BuilderCallback} from "yargs";
import {serverOpts, ServerOptions, serverBuilderOptions} from "../../core/server/opts";
import {globalOptsBuilder} from "../../core/global/opts";

export const command = "server";
export const desc:string = "aio server service";

export const builder:BuilderCallback<ServerOptions, any> = yargs => {
    return globalOptsBuilder(serverBuilderOptions( yargs ), value => {
        return Object.assign({}, value?.server||{} );
    });
};
export const handler = function ( argv: yargs.Arguments<ServerOptions> ) {
    serverOpts( argv );
    require( "../../core/server" ).default( argv );
}
