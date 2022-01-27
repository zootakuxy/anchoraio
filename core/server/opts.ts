import  {Argv} from "yargs";
import {typeParser} from "../global/parser";
import {Defaults} from "../global/defaults";
import {GlobalOpts} from "../global/opts";

export type ServerOptions = GlobalOpts & {
    serverPort:number,
    anchorPort:number,
};


const status:{
    value?:ServerOptions
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

export function serverOpts(opts?:ServerOptions ){
    if( opts && typeof  opts === "object" ) status.value = opts;
    return status.value;
}