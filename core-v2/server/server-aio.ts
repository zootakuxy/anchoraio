import {BaseEventEmitter} from "kitres/src/core/util";
import {
    AgentAuthenticate,
    AnchorSocket,
    ApplicationGetawayAuth,
    AuthSocketListener,
    ListenableAnchorSocket
} from "../net";
import {TokenService} from "../services";
import {ServerOptions} from "./server-proxy";

interface ServerAioEvent {
}



export type ServerSlot = {
    server:string,
    grants:string[],
    app:string|number,
    busy:boolean,
    slotId:string
    referer:string
    connect:ListenableAnchorSocket<{ }, {
        busy( origin:string ):void,
        auth( authData:ApplicationGetawayAuth ):void
    }>
};

export type WaitConnection = {
    resolve:( slot:ServerSlot )=>void;
    connection:AnchorSocket<{
        client:string
    }>
    referer:string
    resolved?: boolean,
    id?:string,
    agent:string,
}

let createProxy = ()=>{
    return new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p]) target[p] = new Proxy({}, {
                get(target: {}, p: string | symbol, receiver: any): any {
                    if( !target[p]) target[p] = [];
                    return target[p];
                }
            })
            return target[p];
        }
    })
}

let createProxyObject = ()=>{
    return new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p]) target[p] = new Proxy({}, {
                get(target: {}, p: string | symbol, receiver: any): any {
                    if( !target[p]) target[p] = {};
                    return target[p];
                }
            })
            return target[p];
        }
    })
}



export class ServerAio extends BaseEventEmitter<ServerAioEvent> {
    public serverSlots:{
        [server:string]:{
            [app:string]:{[id:string]:ServerSlot}
        }
    };

    public waitConnections:{
        [server:string]:{
            [app:string]: {
                [ connection:string ]:WaitConnection
            }
        }
    }

    public  tokenService;

    public agents : {
        [p:string]: ListenableAnchorSocket<AgentAuthenticate, AuthSocketListener >
    }

    constructor( opts:ServerOptions ) {
        super();
        this.agents = {};
        this.serverSlots = createProxyObject();
        this.waitConnections= createProxy();
        this.tokenService = new TokenService( opts );
    }

    public release( slot:ServerSlot )  {

        let next = Object.entries( this.waitConnections[slot.server][slot.app]).find( ([key, wait], index) => {
            return !wait.resolved && wait.connection.status() === "connected"
                ;
        });


        if( !!next ) {
            let [ key, wait ] = next;
            wait.resolved = true;
            delete this.waitConnections[slot.server][slot.app][ wait.id ];
            wait.resolve ( slot );
            console.log( `server.release getaway response for application = "${slot.app}" server = "${ slot.server}" CREATED & APPLIED` );
            return;
        }
        console.log( `server.release getaway response for application = "${slot.app}" server = "${ slot.server}" CREATED` );

        slot.connect.on( "close", hadError => {
            delete this.serverSlots[ slot.server ][ slot.app ][ slot.connect.id() ];
        });
        this.serverSlots[ slot.server ][ slot.app ][ slot.connect.id() ] = slot;
        slot.connect.on( "close", hadError => {
            console.log( `server.release getaway response for application = "${slot.app}" server = "${ slot.server}" CLOSED` );
            delete this.serverSlots[ slot.server ][ slot.app ][ slot.connect.id() ];
        });
    }

    clientsOf(opts:{ server:string, application?:string }):ListenableAnchorSocket<AgentAuthenticate, AuthSocketListener >[]{
        console.log( `Server> find client for application = "${ opts.application }"  server = "${ opts?.server } "`)
        let server = this.agents[ opts.server ];
        Object.entries( this.agents ).forEach( value => {
            console.log( `Agent = ${ value[0]} | Connection ${ !!value[1] }`)
        });
        return  Object.values(this.agents)
            .filter((client, index) => {
                if (client.props().agent === opts.server) return false;
                if (!client.props().servers.includes( opts.server )) return false;
                if( opts.application ){
                    let app = server.props().apps[ opts.application ];
                    if( !app ) return false;
                    if( app.grants.includes( "*" ) ) return true;
                    return app.grants.includes( client.props().agent );
                }
                return true;
            });
    }

    serverOf(opts:{ client:string }):ListenableAnchorSocket<AgentAuthenticate, AuthSocketListener >[]{
        let client = this.agents[ opts.client ];
        return  Object.values(this.agents)
            .filter((server, index) => {
                if (server.props().agent === opts.client) return false;
                if (!client.props().servers.includes( server.props().agent ) ) return false;
                return Object.values( server.props().apps ).find( app => {
                    if( app.grants.includes( "*" )) return true;
                    return app.grants.includes( client.props().agent );
                });
            });
    }

    isLast( socket:ListenableAnchorSocket<AgentAuthenticate, AuthSocketListener >){
        let auth = this.agents[ socket.props().agent ];
        return auth.id() === socket.id();
    }

    public resolver ( server:string, application:string, wait:WaitConnection ){
        console.log( `server.resolver getaway request from ${ wait.agent } to ${ application}.${ server } connected` );

        let entry = Object.entries( this.serverSlots[server][application] ).find( ([ key, value]) => {
            if( !value ) return false;
            return value.server === server
                && value.app === application
                && !value.busy
        });

        if( entry && entry[1] ){
            console.log( `server.resolver:RESOLVER_IMMEDIATELY ` )
            let next = entry[1];
            next.busy = true;
            delete this.serverSlots[server][application][ next.connect.id() ];
            wait.resolve( next );
            return;
        }
        console.log( `server.resolver:RESOLVER_WAIT` )
        this.waitConnections[server][application][ wait.connection.id() ] = wait;
        wait.connection.on( "close", hadError => {
            console.log( `server.resolver getaway request from ${ wait.agent } to ${ application}.${ server } CLOSED` );
            delete this.waitConnections[server][application][ wait.connection.id()  ];
            if( hadError ) console.log( `detached wait connection for ${ application }.${ server } because remittent connection ${ wait.connection.id() } is closed!`)
        });
        this.agents[ server ].send( "hasPendentRequest", {
            client: wait.agent,
            server: server,
            application: application
        });
    }
}