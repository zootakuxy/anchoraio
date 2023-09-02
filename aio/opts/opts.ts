import {Argv} from "yargs";
import {loadConfigsFile} from "../load";
import Path from "path";
import {AgentLauncherOptions} from "./opts-agent";
import path from "path";



export const Defaults = {
    //language=file-reference
    envFile: path.join(__dirname, "../../etc/anchorio.conf" ),
    etc: path.join(__dirname, "../../etc/entry" ),
    anchorPort:  36900,
    authPort:  36910,
    requestPort:  36920,
    responsePort:  36930,
    restoreTimeout: 1500,
    serverHost: "127.0.0.1",
    releases: 2,
}

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
            const values =  loadConfigsFile<{ agent?:AgentLauncherOptions, etc?:string }>( configPath, "utf8" );
            let etc = values?.etc;
            if( etc && !Path.isAbsolute( etc ) ) {
                etc = Path.join( Path.dirname( configPath ), etc )
            }

            let result = { };
            if( typeof parse === "function" ) Object.assign(result, parse( values ),{
                etc
            });
            return result;
        })
        .parserConfiguration({ "strip-aliased": true})
}

export function aioOpts(yargs:Argv<BaseOptions>, parse:(value:any )=>any){

    baseOpts( yargs, parse );

}