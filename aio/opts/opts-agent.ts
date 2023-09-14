import  {Argv} from "yargs";
import {lib} from "../../core-v2/utils/lib";
import Path from "path";
import fs from "fs";
import {AgentAioOptions} from "../../core-v2/agent/agent-aio";
import {Defaults} from "../../core-v2/defaults";

export type AgentLauncherOptions = AgentAioOptions & {
    selfServer: boolean
};

export function agentOptsBuilder( yargs:Argv<AgentLauncherOptions> ){
    yargs.option( "identifier", {
        alias: [ "id", "i" ],
        type: "string",
        coerce: ( identifier)=>{
            return lib.typeParser.asString( identifier)
        },
        description: "Identificador unico do agentProxy",
        demandOption: true
    });

    yargs.check( argv => {
        let identifier = argv._[1] ?? argv.identifier;
        let result =  typeof identifier === "string"
            && identifier.trim().length
            && identifier === identifier.toLowerCase();
        if( !result ) throw new Error( "Invalid or missing agentProxy identifier" );
        return true;
    })

    yargs.option( "serverHost", { alias: [ "h", "host" ],
        type: "string",
        default: Defaults.serverHost,
        coerce: lib.typeParser.asString,
        demandOption: true
    });


    yargs.option( "requestPort", {
        type:"number",
        alias: [ "req-port", "req" ],
        default: Defaults.requestPort,
        coerce: lib.typeParser.asInt,
        demandOption: true
    });

    yargs.option( "responsePort", {
        type:"number",
        alias: [ "response", "resp" ],
        default: Defaults.responsePort,
        coerce: lib.typeParser.asInt,
        demandOption: true
    });

    yargs.option( "authPort", {
        type:"number",
        alias: [ "auth" ],
        default: Defaults.authPort,
        coerce: lib.typeParser.asInt,
        demandOption: true
    });

    yargs.option( "anchorPort", {
        type:"number",
        alias: [ "anchor" ],
        default: Defaults.anchorPort,
        coerce: lib.typeParser.asInt,
        demandOption: true
    });

    yargs.option("directConnection", {
        type:"string",
        default: "on",
        choices:[ "on", "off" ],
        "description": "Enable or disable direct connection for real server when"
    })


    yargs.option( "selfServer",  {
        type: "boolean",
        description: "Start self server"
    });

    yargs.option( "getawayReleaseOnDiscover", {
        type: "boolean",
        default: false,
    });

    yargs.option( "getawayRelease", {
        type: "string",
    });

    yargs.option( "getawayReleaseTimeout", {
        type: "string",
    });

    yargs.option( "requestTimeout", {
        type: "string"
    })

    let noPortVar = Path.join( __dirname, "../../../noport/var" );
    if( !fs.existsSync( noPortVar ) ) noPortVar = null;
    if( !!noPortVar && !fs.statSync( noPortVar ).isDirectory() ) noPortVar = null;
    yargs.option( "noPortVar",  {
        type: "string",
        description: "No port home dir",
        //language=file-reference
        default: noPortVar,
        coerce:  arg => {
            if( !arg ) return null;
            if( !Path.isAbsolute( arg  ) ) arg = Path.join( process.cwd(), arg );
            if( !fs.existsSync( arg ) ) return null;
            if( !fs.statSync( arg ).isDirectory() ) return  null;
            return arg;
        }
    })

    yargs.option("restoreTimeout", {
        type: "number",
        default: Defaults.restoreTimeout
    });

    return yargs;
}