import  {Argv} from "yargs";
import {lib} from "../../core-v2/lib";
import {ServerOptions} from "../../core-v2/server/server-proxy";
import {Defaults} from "./opts";

export function serverBuilderOptions(yargs:Argv<ServerOptions> ){

    yargs.option( "responsePort", { alias: [ "R", "resp" ],
        type:"number",
        coerce: lib.typeParser.asInt,
        default: Defaults.responsePort
    });

    yargs.option( "requestPort", { alias: [ "r", "req" ],
        type:"number",
        coerce: lib.typeParser.asInt,
        default: Defaults.requestPort
    });

    yargs.option( "authPort", { alias: [ "a", "auth" ],
        type:"number",
        coerce: lib.typeParser.asInt,
        default: Defaults.anchorPort
    });
    return yargs;
}
