import path from "path";
import {AppProtocol} from "./protocol";


const protocols:{
    [k in AppProtocol ]: {
        serverRelease: number,
        getawayRelease: number
    }
} = {
    http: {
        serverRelease: 5 as const,
        getawayRelease: 10 as const
    } as const, https: {
        serverRelease: 5 as const,
        getawayRelease: 10 as const
    } as const,
    aio: {
        serverRelease: 2 as const,
        getawayRelease: 2 as const
    } as const,
    pg: {
        serverRelease: 1 as const,
        getawayRelease: 1 as const
    } as const,
    mysql: {
        serverRelease: 5 as const,
        getawayRelease: 5 as const
    }
} as const;

const _def =  {
    envFile: path.join(__dirname, /*language=file-reference*/ "../etc/anchorio.conf" ),
    etc: path.join(__dirname, /*language=file-reference*/ "../etc/entry" ),
    anchorPort:  36900 as const,
    authPort:  36910 as const,
    requestPort:  36920 as const,
    responsePort:  36930 as const,
    restoreTimeout: 1500 as const,
    serverHost: "127.0.0.1" as const,
    serverRelease: 3 as const,
    getawayRelease: 3 as const,
    getawayReleaseTimeout: 1000 * 60 * 1.5,
    requestTimeout: 1000 * 30,
    protocol: protocols
};


export const Defaults: {
    readonly [p in keyof typeof _def ]: typeof _def[p]
} = new Proxy(_def, {
    set(target, p: string | symbol, newValue: any, receiver: any): boolean {
        return false;
    }
});



