import  {Argv} from "yargs";
import {aio} from "../../aio/aio";
import {lib} from "../../aio/lib";

export type TokenOption = aio.GlobalOpts & {
    identifier?:string
    generate?:boolean
    update?:boolean
    list?:boolean
    format?:"table"|"json"|"label"|"ini"|"file"|"cfg",
    status?:"active"|"disable"
};

export function tokenBuilderOptions(yargs:Argv<TokenOption> ){

    yargs.option( "identifier", { alias: [ "id", "i" ],
        type: "string",
        coerce: lib.typeParser.asString,
        description: "Agent unique identifier",
        // demandOption: true
    });

    yargs.option( "generate",  {
        type: "boolean",
        description: "Generate or update token for identifier"
    });

    yargs.option( "update",  {
        type: "boolean",
        description: "Update generate token"
    });

    yargs.option( "list",  {
        type: "boolean",
        description: "List all token"
    });

    yargs.option( "format",  {
        type: "string",
        choices:[ "table", "ini", "label", "json", "file", "cfg" ],
        description: "Generate or update token for identifier",
        default: "table"
    });

    yargs.option( "status",  {
        type: "string",
        choices: ["active", "disable" ],
        description: "Change token status",
        default: "active"
    });

    return yargs;
}
