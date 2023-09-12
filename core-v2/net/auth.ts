export type AuthResult = {
    id:string,
    referer:string
    availableServers:string[]
}

export interface AuthSocketListener {
    auth( auth:AuthResult )
    authFailed( code:string, message:string )
    isAlive( code:string, referer ),
    serverOpen( server:string ),
    serverClose( server:string )
}


export type AuthIO = {
    server:string
    app:string|number,
    authReferer:string,
    origin:string,
    authId:string
}

export type AuthAgent = {
    agent:string,
    token:string,
    servers:string[]
}
