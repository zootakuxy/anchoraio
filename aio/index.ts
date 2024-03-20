#!/usr/bin/node


require("source-map-support").install();
import yargs from "yargs";
import * as path from "path";

process.on('unhandledRejection', (reason, p) => {
    console.log( "[[================ [Unhandled Rejection at Promise] ================" );
    console.error( reason?.toString?.() );
    console.error( reason );
    p.catch( reason1 => {
        console.error( reason1?.toString?.() );
        console.error( reason1 );
    })
    console.log( "================ Unhandled Rejection at Promise ================]]" );
});
process.on('uncaughtException', err => {
    console.log( "[[================ [Uncaught Exception Thrown] ================" );
    console.error( err?.toString?.() );
    console.error( err );
    console.log( "================ Uncaught Exception thrown ================]]" );
});

process.on('uncaughtExceptionMonitor', err => {
    console.log( "[[================ [Uncaught Exception Exception Monitor] ================" );
    console.log( err?.toString?.() );
    console.error( err );
    console.log( "================ Uncaught Exception Exception Monitor ================]]" );
});

process.on('rejectionHandled', err => {
    console.log( "[[================ [Rejection Handled] ================" );
    console.error( err?.toString?.() );
    console.error( err );
    console.log( "================ Rejection Handled ================]]" );
});

let ss = yargs(process.argv.slice(2))
    //language=file-reference
    .commandDir(path.join( __dirname, "./commands" ) )
    .demandCommand()
    .help()
    .argv;
