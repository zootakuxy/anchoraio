import path from "path";

export const Defaults = {
    //language=file-reference
    envFile: path.join(__dirname, "../../etc/sample.conf" ),
    serverPort: 8100,
    agentPort:  8101,
    anchorPort: 8202,
    dnsPort:    53,
    serverHost: "127.0.0.1",
    reconnectTimeout: 1000,
    maxSlots: 15,
    minSlots: 4,
    dns: [ "8.8.8", "8.8.4.4" ]
}