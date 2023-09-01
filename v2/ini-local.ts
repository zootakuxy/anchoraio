import {agent} from "./src/agent-io-v2";

require("source-map-support").install();

import {server} from "./src/server-io-v2";
import {AGENT_ANCHOR_PORT, SERVER_REQUEST_PORT, SERVER_RESPONSE_PORT} from "./PORTS";

server({
    requestPort: SERVER_REQUEST_PORT,
    responsePort: SERVER_RESPONSE_PORT
});

agent({
    agentName: "zootakuxy.aio",
    serverRequestPort: SERVER_REQUEST_PORT,
    serverResponsePort: SERVER_RESPONSE_PORT,
    serverHost: "127.0.0.1",
    apps: [{
        port: 80,
        name: "maguita",
        host: "127.0.0.1",
        releases: 15
    }],
    anchorPort: AGENT_ANCHOR_PORT
})