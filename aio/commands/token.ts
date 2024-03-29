import yargs, {BuilderCallback} from "yargs";
import {baseOpts} from "../opts/opts";
import {tokenBuilderOptions, TokenOptions} from "../opts/opts-token";

export const command = "token";
export const desc:string = "Manage server token";

export const builder:BuilderCallback<TokenOptions, any> = yargs => {
    return baseOpts( tokenBuilderOptions( yargs ), value => {
        return Object.assign({}, value?.server||{} );
    })
};
export const handler = function ( argv: yargs.Arguments<TokenOptions> ) {
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
    const { TokenService } =  require( "../../core-v2/services/token.service" );
    let ts = new TokenService( argv );
    let resultCode = ts.start();
    process.exit( resultCode );
}
