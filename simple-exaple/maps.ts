export const serverHost = process.argv[2];
export const identifier = process.argv[3];
export const server = process.argv[4];
export const agentPort = 8080;
export const serverPort = 48000;
export const serverAnchorPort = 48001

export const hosts = {
    //web
    "127.100.1.1": { server: server, application: 80 },
    "127.100.2.2": { server: server, application: "web" },

    //postgres
    "127.100.1.3": { server: server, application: 5432 },
    "127.100.1.4": { server: server, application: "postgres" },

    //web
    "127.200.1.1": { server: identifier, application: 80 },
    "127.200.2.2": { server: identifier, application: "web" },

    //postgres
    "127.200.1.3": { server: identifier, application: 5432 },
    "127.200.1.4": { server: identifier, application: "postgres" },
}

console.table( hosts );

export const apps = {
    web: { address:"127.0.0.1", port: 80 },
    postgres: { address:"127.0.0.1", port: 5432 },
}
