let scape = "\\|";
let delimiter = "||";

console.log( "escape", scape)

let strs = [ "NANE ANA||Age 23|Morada Riboque",
    "NANE ANA|Age 23|Morada Riboque" ];

let joins = strs.map( value => {
    return value.replace( /\|/g, scape );
}).join( delimiter );

console.log( "JOINS:", joins );

joins.split( delimiter ).forEach( value => {
    console.log( "SCAPE-PART",value );
    console.log( "ORIGINAL-PART",value.replace( /\\\|/g, "|") );
});