import {agent} from "./agent-io-v2";
agent({
    agentName: "central.aio",
    serverRequestPort: 35051,
    serverResponsePort: 35052,
    serverHost: "127.0.0.1",
    apps: [{
        port: 80,
        name: "maguita",
        host: "127.0.0.1",
        releases: 3
    }],
    anchorPort: 5050
})