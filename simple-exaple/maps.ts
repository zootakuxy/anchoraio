export const identifier = "zootakuxy.aio";
export const serverHost = "aio.brainsoftstp.com";
export const agentPort = 88;
export const serverPort = 48000;
export const serverAnchorPort = 48001

export const hosts = {
    //zootakuxy.aio
    "127.100.1.1": { server: "zootakuxy.aio", application: 5432 },
    "127.100.1.2": { server: "zootakuxy.aio", application: 49278 },
    "127.100.1.3": { server: "zootakuxy.aio", application: "maguita" },
    "127.100.1.4": { server: "zootakuxy.aio", application: "postgres" },

    //kadafi.aio
    "127.100.1.5": { server: "kadafi.aio", application: 5432 },
    "127.100.1.6": { server: "kadafi.aio", application: 49278 },
    "127.100.1.7": { server: "kadafi.aio", application: "maguita" },
    "127.100.1.8": { server: "kadafi.aio", application: "postgres" },
    "127.100.2.1": { server: "zootakuxy.aio", application: "webMaguita" },
}

export const apps = {
    maguita: { address:"127.0.0.1", port: 49278 },
    postgres: { address:"127.0.0.1", port: 5432 },
    webMaguita: { address:"maguita.brainsoftstp.com", port: 49278 },
}
