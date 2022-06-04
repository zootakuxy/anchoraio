import  {Argv} from "yargs";
import {aio} from "../aio/aio";
import {lib} from "../aio/lib";

export type AgentOpts = aio.GlobalOpts & {
    identifier:string,
    serverHost:string,
    serverPort:number,
    agentPort:number,
    agentAPI:number,
    dnsPort: number,
    noDNS: boolean
    noAPI: boolean
    dns:string[],
    reconnectTimeout:number
    maxSlots:number
    minSlots:number
    chanel:number
    selfServer:boolean
};

export function agentOptsBuilder( yargs:Argv<AgentOpts> ){
    yargs.option( "identifier", { alias: [ "id", "i" ],
        type: "string",
        coerce: lib.typeParser.asString,
        description: "Identificador unico do agent",
        demandOption: true
    });

    yargs.check( argv => {
        let identifier = argv._[1] ?? argv.identifier;
        let result =  typeof identifier === "string"
            && identifier.trim().length
            && identifier === identifier.toLowerCase();
        if( !result ) throw new Error( "Invalid or missing agent identifier" );
        return true;
    })

    yargs.option( "serverHost", { alias: [ "h", "host" ],
        type: "string",
        default: aio.Defaults.serverHost,
        coerce: lib.typeParser.asString,
        demandOption: true
    })

    yargs.option( "serverPort", {
        type:"number",
        coerce: lib.typeParser.asInt,
        default: aio.Defaults.serverPort
    });

    yargs.option( "agentPort", { alias: [ "port", "p" ],
        type:"number",
        coerce: lib.typeParser.asInt,
        default: aio.Defaults.agentPort,
        demandOption: true
    });

    yargs.option( "agentAPI", { alias: [ "api", "a" ],
        type:"number",
        coerce: lib.typeParser.asInt,
        default: aio.Defaults.agentAPI,
        demandOption: true
    });

    yargs.option( "dnsPort", {
        type: "number",
        coerce: lib.typeParser.asInt,
        default: aio.Defaults.dnsPort
    });

    yargs.option( "dns", {
        type: "string",
        array: true,
        coerce: lib.typeParser.asStringArray
    })

    yargs.option( "reconnectTimeout", {
        type: "number",
        default: aio.Defaults.reconnectTimeout,
        coerce: lib.typeParser.asInt,
        demandOption: true
    })

    yargs.option( "noDNS",  {
        type: "boolean",
        description: "Disable dns server"
    });


    yargs.option( "noAPI",  {
        type: "boolean",
        description: "Disable api"
    });



    yargs.option( "selfServer",  {
        type: "boolean",
        description: "Start self server"
    })

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

    yargs.option( "chanel", {
        type: "number",
        default: aio.Defaults.chanel,
        demandOption: true,
        coerce: lib.typeParser.asInt
    })
    return yargs;
}