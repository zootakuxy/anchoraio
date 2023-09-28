import {AvailableServer} from "../agent";

export type AuthResult = {
    id:string,
    referer:string
    availableServers: {
        [ server:string ]: AvailableServer
    }
}

export type RemoteServerNotifyOptions = {
    server:string,
    application:string,
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

export type PendentRequest = {
    client:string,
    server:string,
    application:string
}

export interface AuthSocketListener {
    auth( auth:AgentAuthenticate )
    authResult(auth:AuthResult )
    authFailed( code:string, message:string )
    isAlive( code:string, referer ),

    remoteServerOnline( server:string ),
    remoteServerOffline( server:string ),

    applicationOnline(opts:ServerReleaseOptions ),
    applicationOffline(opts:ServerReleaseOptions ),

    busy( busy:SlotBusy )
    hasPendentRequest( pendentRequest:PendentRequest )
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

export type AuthApplication = {
    name:string,
    grants:string[],
    status?:"offline"|"online"
}

export type AgentAuthenticate = {
    id?:string,
    token?:string
    referer?:string,
    agent:string,
    apps:{
        [application:string]:AuthApplication
    }
    machine:string
    servers:string[],
    status?:"online"|"offline"
}

