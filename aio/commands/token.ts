import yargs, {BuilderCallback} from "yargs";
import {baseOpts} from "../opts";
import {tokenBuilderOptions, TokenOption} from "../../core/service/token.service/opts";

export const command = "token";
export const desc:string = "Manage server token";

export const builder:BuilderCallback<TokenOption, any> = yargs => {
    return baseOpts( tokenBuilderOptions( yargs ), value => {
        return Object.assign({}, value?.server||{} );
    })
};
export const handler = function ( argv: yargs.Arguments<TokenOption> ) {
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
    const { TokenService } =  require( "../../core/service/token.service" );
    new TokenService( argv ).start();
}
