import {server} from "./server-io-v2";

export const SERVER_REQUEST_PORT = 37051;
export const SERVER_RESPONSE_PORT = 37052;
export const AGENT_ANCHOR_PORT = 37050;

server({
    requestPort: SERVER_REQUEST_PORT,
    responsePort: SERVER_RESPONSE_PORT
});
