import yargs, {BuilderCallback} from "yargs";
import {baseOpts} from "../opts/opts";
import {resolveBuilderOptions, ResolveOptions} from "../opts/remote-app";

export const command = "remote";
export const desc:string = "Manage remote connections";

export const builder:BuilderCallback<ResolveOptions, any> = yargs => {
    return baseOpts( resolveBuilderOptions( yargs ), value => {
        return Object.assign({}, value?.agent || {} );
    })
};
export const handler = function ( argv: yargs.Arguments<ResolveOptions> ) {
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
    const { ResolveService } =  require( "../../core-v2/services/remote.service" );
    let ts = new ResolveService( argv );
    let resultCode = ts.start();
    process.exit( resultCode );
}
