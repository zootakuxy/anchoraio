import {Argv} from "yargs";
import {lib} from "../../core-v2";
import {AIOHostRegisterOptions} from "../../core-v2";
import {BaseOptions} from "./opts";
import {Defaults} from "../../core-v2";

export type ResolveOptions = BaseOptions & AIOHostRegisterOptions &{
    remoteServer?:string
    address?:string
    aioApplicationDomain?:string
    generate?:boolean
    update?:boolean
    list?:boolean
    format?:"table"|"json"|"label"|"ini"|"file"|"cfg",
    status?:"active"|"disable",
    noPortEntry?:string
    noPortDomain?:string[]
    anchorPort:number,
    action:"sets"|"view"

};


export function resolveBuilderOptions(yargs:Argv<ResolveOptions> ){


    yargs.option( "update",  { alias:[ "u", "force", "f" ],
        type: "boolean",
        description: "Update generate token"
    });

    yargs.option( "generate",  { alias: [ "g" ],
        type: "boolean",
        description: "Generate or update token for identifier"
    });

    yargs.option( "action", {
        alias:[ ],
        type:"string",
        choices: ["sets", "view" ],
        default: "view",
        description: "Do action",
    });

    yargs.option( "sets", {
        alias:[ ],
        type:"boolean",
        default: false,
        description: "Do action sect",

    });



    yargs.option( "noPortDomain",  {
        alias: [ "n", "noPort" ],
        type: "string",
        array: true,
        description: "Domain in noport"
    });

    yargs.option( "list",  {
        type: "boolean",
        description: "List all token"
    });

    yargs.option( "format",  { alias: "F",
        type: "string",
        choices:[ "table", "ini", "label", "json", "file", "cfg" ],
        description: "Generate or update token for identifier",
        default: "label"
    });


    yargs.option( "status",  { alias: "s",
        type: "string",
        choices: ["active", "disable" ],
        description: "Change token status",
        default: "active"
    });

    yargs.option( "address",  {
        alias: [ "address", "localAddress" ],
        type: "string",
        description: "Port of application",
    });

    yargs.option( "aioApplicationDomain",  {
        alias: [ "domain", "app", "application" ],
        type: "string",
        description: "Remote application name",
        demandOption: true
    });

    yargs.option( "anchorPort", {
        type:"number",
        alias: [ "anchor" ],
        default: [Defaults.anchorPort],
        coerce: arg => {
            if( !Array.isArray( arg ) && Number.isNaN( Number( arg ) ) ) return null;
            if(!Array.isArray( arg ) ) return [Number( arg )];
            let ports = [...arg]
                .map( value => Number( value ) )
                .filter( value => !Number.isNaN( value ) )
            ;
            if( !ports.length ) return null;
            return ports;
        },
        demandOption: true
    });



    return yargs;
}
