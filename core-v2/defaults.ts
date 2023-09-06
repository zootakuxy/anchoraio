import path from "path";

export const Defaults = {
    //language=file-reference
    envFile: path.join(__dirname, "../etc/anchorio.conf" ),
    etc: path.join(__dirname, "../../etc/entry" ),
    anchorPort:  36900,
    authPort:  36910,
    requestPort:  36920,
    responsePort:  36930,
    restoreTimeout: 3500,
    serverHost: "127.0.0.1",
    releases: 2,
    getawayRelease: 3,
    // getawayReleaseTimeout: 1000 * 60 * 3,
    // getawayReleaseTimeoutBreak: 1000 * 60 * 5,
    getawayReleaseTimeout: 1000 * 60 * 1.5,
}
