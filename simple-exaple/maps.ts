export const serverHost = process.argv[2];
export const identifier = process.argv[3];
export const agentPort = 8080;
export const serverPort = 48000;
export const serverAnchorPort = 48001

export const hosts = {
    //zootakuxy.aio
    "127.100.1.1": { server: identifier, application: 5432 },
    "127.100.1.2": { server: identifier, application: 49278 },
    "127.100.1.3": { server: identifier, application: "maguita" },
    "127.100.1.4": { server: identifier, application: "postgres" },
    "127.100.2.1": { server: identifier, application: "" },
}

export const apps = {
    maguita: { address:"127.0.0.1", port: 49278 },
    postgres: { address:"127.0.0.1", port: 5432 },
    webMaguita: { address:"maguita.brainsoftstp.com", port: 49278 },
}
