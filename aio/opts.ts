import {Argv} from "yargs";
import {loadConfigsFile} from "./load";
import {AgentOpts} from "../core/agent/opts";
import Path from "path";
import {aio} from "../core/socket/aio";
import {lib} from "../core/lib";
import BaseOpts = aio.BaseOpts;




export function baseOpts(yargs:Argv<BaseOpts>, parse:(value:any )=>any):Argv<BaseOpts>{
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

export function aioOpts(yargs:Argv<aio.GlobalOpts>, parse:(value:any )=>any){
    yargs.option( "maxSlots", {
        type: "number",
        default: aio.Defaults.maxSlots,
        demandOption: true,
        coerce: lib.typeParser.asInt
    })

    yargs.option( "minSlots", {
        type: "number",
        default: aio.Defaults.minSlots,
        demandOption: true,
        coerce: lib.typeParser.asInt
    })
    return baseOpts( yargs, parse );

}