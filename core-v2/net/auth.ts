import {AvailableServer} from "../agent";

export type AuthResult = {
    id:string,
    referer:string
    availableServers: {
        [ server:string ]: AvailableServer
    }
}

export type ServerReleaseOptions = {
    server:string,
    application:string,
    grants:string[]
}
export type SlotBusy = {
    application:string,
    slotId:string,
    origin:string
}

export interface AuthSocketListener {
    auth( auth:AuthAgent )
    authResult(auth:AuthResult )
    authFailed( code:string, message:string )
    isAlive( code:string, referer ),
    remoteServerOpen( server:string ),
    remoteServerClosed( server:string ),
    appServerRelease( opts:ServerReleaseOptions ),
    appServerClosed( opts:ServerReleaseOptions ),
    busy( busy:SlotBusy )
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
    grants:string[],
    slotId: string
}

export type RequestGetawayAuth = AuthIO& {
}

export type AuthAgent = {
    agent:string,
    token:string,
    servers:string[],
    machine: string,
}
