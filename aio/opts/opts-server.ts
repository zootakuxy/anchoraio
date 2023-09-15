import  {Argv} from "yargs";
import {lib} from "../../core-v2";
import {ServerOptions} from "../../core-v2";
import {Defaults} from "../../core-v2";

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
