import  {Argv} from "yargs";
import {typeParser} from "../global/parser";
import {Defaults} from "../global/defaults";
import {GlobalOpts} from "../global/opts";

export type AgentOpts = GlobalOpts & {
    identifier:string,
    serverHost:string,
    serverPort:number,
    agentPort:number,
    anchorPort:number,
    dnsPort: number,
    dns:string[],
    reconnectTimeout:number
    maxSlots:number
    minSlots:number
};


const status:{
    value?:AgentOpts
} = {}

export type OptionBuilder = {
    integer:OptionBuilder,
    number:OptionBuilder,
    string:OptionBuilder
    boolean:OptionBuilder,
    alias(...alias):OptionBuilder,
    as( ):OptionBuilder,
    description( desc:string  ):OptionBuilder
}

export function agentOptsBuilder( yargs:Argv<AgentOpts> ){
    yargs.option( "identifier", { alias: [ "id", "i" ],
        type: "string",
        coerce: typeParser.asString,
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
        default: Defaults.serverHost,
        coerce: typeParser.asString,
        demandOption: true
    })

    yargs.option( "serverPort", {
        type:"number",
        coerce: typeParser.asInt,
        default: Defaults.serverPort
    });

    yargs.option( "agentPort", { alias: [ "port", "p" ],
        type:"number",
        coerce: typeParser.asInt,
        default: Defaults.agentPort,
        demandOption: true
    });

    yargs.option( "anchorPort", { alias: [ "P" ],
        type: "number",
        coerce: typeParser.asInt,
        default: Defaults.anchorPort
    });

    yargs.option( "dnsPort", {
        type: "number",
        coerce: typeParser.asInt,
        default: Defaults.anchorPort
    });

    yargs.option( "dns", {
        type: "string",
        array: true,
        coerce: typeParser.asStringArray
    })

    yargs.option( "reconnectTimeout", {
        type: "number",
        default: Defaults.reconnectTimeout,
        coerce: typeParser.asInt,
        demandOption: true
    })

    yargs.option( "maxSlots", {
        type: "number",
        default: Defaults.maxSlots,
        demandOption: true,
        coerce: typeParser.asInt
    })

    yargs.option( "minSlots", {
        type: "number",
        default: Defaults.minSlots,
        demandOption: true,
        coerce: typeParser.asInt
    })
    return yargs;
}

export function agentOptions( opts?:AgentOpts ){
    if( opts && typeof  opts === "object" ) status.value = opts;
    return status.value;
}