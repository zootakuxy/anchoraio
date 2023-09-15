import {Argv} from "yargs";
import {loadConfigsFile} from "../load";
import Path from "path";
import {AgentLauncherOptions} from "./opts-agent";
import {Defaults} from "../../core-v2";




export interface BaseOptions {
    etc:string,
    envFile:string,
}

export function baseOpts(yargs:Argv<BaseOptions>, parse:(value:any )=>any):Argv<BaseOptions>{
    return yargs.env("AIO" )
        .options("envFile", {
            default: Defaults.envFile,
        })
        .config("envFile", "Camoinho para ficheiro das variaveis", configPath => {
            const values =  loadConfigsFile<{ agent?:AgentLauncherOptions, etc?:string, noPortEntry?:string  }>( configPath, "utf8" );
            let etc = values?.etc;
            let noPortEntry = values?.noPortEntry;
            if( etc && !Path.isAbsolute( etc ) ) {
                etc = Path.join( Path.dirname( configPath ), etc )
            }

            if( noPortEntry && !Path.isAbsolute( noPortEntry ) ){
                noPortEntry = Path.join( Path.dirname( configPath ), noPortEntry );
            }

            let result = { };
            if( typeof parse === "function" ) Object.assign(result, parse( values ),{
                etc,
                noPortEntry
            });
            return result;
        })
        .parserConfiguration({ "strip-aliased": true})
}

export function aioOpts(yargs:Argv<BaseOptions>, parse:(value:any )=>any){

    baseOpts( yargs, parse );

}