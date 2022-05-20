import path from "path";

export const Defaults = {
    //language=file-reference
    envFile: path.join(__dirname, "../../etc/anchoraio.conf" ),
    agentPort:  36900,
    agentAPI :  36901,
    serverPort: 36902,
    anchorPort: 36903,
    dnsPort:    53,
    serverHost: "127.0.0.1",
    reconnectTimeout: 1000,
    maxSlots: 6,
    minSlots: 3,
    dns: [ "8.8.8", "8.8.4.4" ]
}