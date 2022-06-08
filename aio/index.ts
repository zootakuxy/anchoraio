require("source-map-support").install();
import yargs from "yargs";
import * as path from "path";

let ss = yargs(process.argv.slice(2))
    //language=file-reference
    .commandDir(path.join( __dirname, "./commands" ) )
    .demandCommand()
    .help()
    .argv;
