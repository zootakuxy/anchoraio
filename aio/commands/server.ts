import yargs, {BuilderCallback} from "yargs";
import { ServerOptions} from "../../core-v2/server/server-proxy";
import {aioOpts} from "../opts/opts";
import {serverBuilderOptions} from "../opts/opts-server";

export const command = "server";
export const desc:string = "Start server service";

export const builder:BuilderCallback<ServerOptions, any> = yargs => {
    return aioOpts( serverBuilderOptions( yargs ), value => {
        return Object.assign({}, value?.server||{} );
    })
};
export const handler = function ( argv: yargs.Arguments<ServerOptions> ) {
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
    console.log( "[ANCHORIO] Server>", "Init...");
    const { server, ServerOptions } =  require( "../../core-v2/server/server-proxy" );
    server( argv );
}
