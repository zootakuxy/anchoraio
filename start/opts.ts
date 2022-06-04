import {Argv} from "yargs";
import {loadConfigsFile} from "./load";
import {AgentOpts} from "../core/agent/opts";
import Path from "path";
import {aio} from "../core/aio/aio";




export function globalOptsBuilder( yargs:Argv<aio.GlobalOpts>, parse:( value:any )=>any){
    return yargs.env("AIO" )
        .options("envFile", {
            default: aio.Defaults.envFile,
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