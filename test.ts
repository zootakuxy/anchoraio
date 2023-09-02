import ini from "ini";
import fs from "fs";



// console.log( a.clientProxy);


let hosts = require("hosts-etc");

let aCoolHost = [];


aCoolHost[aCoolHost.length] =  new hosts.Host(
    "192.168.0.20",
    "their.mc.world", {
        region: "aio",
        comment: "Their Minecraft world!"
    }
)


aCoolHost[aCoolHost.length] = new hosts.Host(
    "192.168.0.1",
    "their.mc.world", {
        region: "aio",
        comment: "Their Minecraft world!"
    }
);

// console.log( aCoolHost )



// aCoolHost.forEach( (value, index) => {
//     // console.log( value )
//     hosts.set( value )
// })
// hosts.useCache(); // this turns cache on, despite the current cache state!


// let doc = fs.readFileSync(hosts.HOSTS).toString();7

let doc = `
# bla bla
# bla bla 2
# bla bla 3
# region aio
their.mc.world\t192.168.0.20\t# Their Minecraft world!
their.mc.world\t192.168.0.1\t# Their Minecraft world!
# region aio
# bla bla bla my sub region
# end region aio/
# end region aio/


`;




const regex = /# region aio([\s\S]*?)# end region aio\//g;
const matches = [];
let match;

while ((match = regex.exec(doc)) !== null) {
    matches.push(match[1].trim());
}

console.log( matches.join("\n") );
// console.log( ini.parse( matches.join("\n") ) );




