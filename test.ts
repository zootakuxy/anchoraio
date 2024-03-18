// // let scape = "\\|";
// // let delimiter = "||";
// //
// // console.log( "escape", scape)
// //
// // let strs = [ "NANE ANA||Age 23|Morada Riboque",
// //     "NANE ANA|Age 23|Morada Riboque" ];
// //
// // let joins = strs.map( value => {
// //     return value.replace( /\|/g, scape );
// // }).join( delimiter );
// //
// // console.log( "JOINS:", joins );
// //
// // joins.split( delimiter ).forEach( value => {
// //     console.log( "SCAPE-PART",value );
// //     console.log( "ORIGINAL-PART",value.replace( /\\\|/g, "|") );
// // });
//
// require("source-map-support").install();
//
// Promise.all( [
//     new Promise( (resolve, reject) => {
//         setTimeout( ()=>{
//             resolve( "Ola Mundo")
//         }, 1500 );
//     }),
//
//     new Promise( (resolve, reject) => {
//         setTimeout( ()=>{
//             resolve( "Ola Mundo")
//         }, 1500 );
//     }),
//     new Promise( (resolve, reject) => {
//         setTimeout( ()=>{
//             reject( new Error("x sf sf d fd fdfd"))
//         }, 1500 );
//     }),
//     new Promise( (resolve, reject) => {
//         setTimeout( ()=>{
//             resolve( "ssds" )
//         }, 1500 );
//     })
// ]).then( value => {
//     console.log( "then", value )
// }).catch( reason => {
//     console.log( "Caio no catch", reason )
// })


import * as arp from "node-arp";

console.log( arp.readMACWindows )

arp.getMAC('192.168.100.1', function(err, mac) {
    if (!err) {
        console.log(mac);
    }
});