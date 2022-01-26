import {asAio} from "./dns/aio.resolve";

export const serverHost = process.argv[2];
export const identifier = asAio( process.argv[3] ).identifier;
export const agentPort = 8888;
export const serverPort = 48000;
export const serverAnchorPort = 48001;

console.log( "identifier", identifier);
