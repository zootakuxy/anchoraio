export type AuthResult = {
    id:string,
    referer:string
    availableServers:string[]
}

export type ServerReleaseOptions = {
    server:string,
    app:string,
    grants:string[]
}
export interface AuthSocketListener {
    auth( auth:AuthAgent )
    authResult(auth:AuthResult )
    authFailed( code:string, message:string )
    isAlive( code:string, referer ),
    remoteServerOpen( server:string ),
    remoteServerClosed( server:string ),
    appServerRelease( opts:ServerReleaseOptions ),
    appServerClosed( opts:ServerReleaseOptions )
}


export type AuthIO = {
    server:string
    app:string,
    authReferer:string,
    origin:string,
    authId:string,
    machine: string
}

export type ApplicationGetawayAuth = AuthIO& {
    grants:string[]
}

export type RequestGetawayAuth = AuthIO& {
}

export type AuthAgent = {
    agent:string,
    token:string,
    servers:string[],
    machine: string,
}
