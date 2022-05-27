import  {Argv} from "yargs";
import {typeParser} from "../global/parser";
import {Defaults} from "../global/defaults";
import {GlobalOpts} from "../global/opts";

export type ServerOptions = GlobalOpts & {
    serverPort:number,
    anchorPort:number,
};

export function serverBuilderOptions(yargs:Argv<ServerOptions> ){

    yargs.option( "serverPort", { alias: [ "p", "port" ],
        type:"number",
        coerce: typeParser.asInt,
        default: Defaults.serverPort
    });

    yargs.option( "anchorPort", { alias: [ "P" ],
        type: "number",
        coerce: typeParser.asInt,
        default: Defaults.anchorPort
    });
    return yargs;
}
