import yargs, {BuilderCallback} from "yargs";
import { ServerOptions, serverBuilderOptions} from "../../core/server/opts";
import {globalOptsBuilder} from "../opts";

export const command = "server";
export const desc:string = "Start server service";

export const builder:BuilderCallback<ServerOptions, any> = yargs => {
    return globalOptsBuilder( serverBuilderOptions( yargs ), value => {
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
    const { ServerContext } =  require( "../../core/service/server.service" );
    new ServerContext( argv ).start();
}
