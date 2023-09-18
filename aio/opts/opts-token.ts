import {Argv} from "yargs";
import {lib} from "../../core-v2";
import {BaseOptions} from "./opts";

export type TokenOptions = BaseOptions & {
    identifier?:string
    generate?:boolean
    update?:boolean
    list?:boolean
    format?:"table"|"json"|"label"|"ini"|"file"|"cfg",
    status?:"active"|"disable",
    mail?:string
};

export function tokenBuilderOptions(yargs:Argv<TokenOptions> ){

    yargs.option( "identifier", { alias: [ "id", "i" ],
        type: "string",
        coerce: lib.typeParser.asString,
        description: "Agent unique identifier",
        // demandOption: true
    });

    yargs.option( "mail", {
        type: "string",
        coerce: lib.typeParser.asString,
        description: "Agent mail",
    });

    yargs.option( "generate",  { alias: [ "g" ],
        type: "boolean",
        description: "Generate or update token for identifier"
    });

    yargs.option( "update",  { alias:[ "u", "force", "f" ],
        type: "boolean",
        description: "Update generate token"
    });

    yargs.option( "list",  {
        type: "boolean",
        description: "List all token"
    });

    yargs.option( "format",  { alias: "F",
        type: "string",
        choices:[ "table", "ini", "label", "json", "file", "cfg" ],
        description: "Generate or update token for identifier",
        default: "table"
    });

    yargs.option( "status",  { alias: "s",
        type: "string",
        choices: ["active", "disable" ],
        description: "Change token status",
        default: "active"
    });

    return yargs;
}
