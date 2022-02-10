import {Argv} from "yargs";
import {Defaults} from "./defaults";
import {loadConfigsFile} from "../../start/load";
import {AgentOpts} from "../agent/opts";
import Path from "path";

export type GlobalOpts = {
    etc:string,
    envFile:string
}


export function globalOptsBuilder( yargs:Argv<GlobalOpts>, parse:( value:any )=>any){
    return yargs.env("AIO" )
        .options("envFile", {
            default: Defaults.envFile,
        })
        .config("envFile", "Camoinho para ficheiro das variaveis", configPath => {
            const values =  loadConfigsFile<{ agent?:AgentOpts, etc?:string, dns?: { dns:string[], dnsPort:number } }>( configPath, "utf8" );
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
        .parserConfiguration({ "strip-aliased": true
        })
}