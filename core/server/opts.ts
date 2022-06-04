import  {Argv} from "yargs";
import {aio} from "../aio/aio";
import {lib} from "../aio/lib";

export type ServerOptions = aio.GlobalOpts & {
    serverPort:number,
    anchorPort:number,
};

export function serverBuilderOptions(yargs:Argv<ServerOptions> ){

    yargs.option( "serverPort", { alias: [ "p", "port" ],
        type:"number",
        coerce: lib.typeParser.asInt,
        default: aio.Defaults.serverPort
    });

    yargs.option( "anchorPort", { alias: [ "P" ],
        type: "number",
        coerce: lib.typeParser.asInt,
        default: aio.Defaults.anchorPort
    });
    return yargs;
}
