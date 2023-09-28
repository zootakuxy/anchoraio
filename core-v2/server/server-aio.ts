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
    connect:ListenableAnchorSocket<{ }, {
        busy( origin:string ),
        auth( authData:ApplicationGetawayAuth )
    }>
};

export type WaitConnection = {
    resolve:( slot:ServerSlot )=>void;
    connection:AnchorSocket<{
        client:string
    }>
    resolved?: boolean,
    id?:string,
    agent:string
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
        [p:string]: AgentAuthenticate & {
            connection:ListenableAnchorSocket<AgentAuthenticate, AuthSocketListener >,
        }
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
        let server = this.agents[ opts.server ];
        return  Object.entries(this.agents)
            .map(([keyId, client], index) => client.connection)
            .filter((client, index) => {
                if (client.props().agent === opts.server) return false;
                if (!client.props().servers.includes( opts.server )) return false;
                let hasPermission = true;
                if( opts.application ){
                    let app = server.apps[ opts.application ];
                    hasPermission = app && ( app.grants.includes( "*" ) || app.grants.includes( client.props().agent ) );
                }
                return hasPermission;
            });
    }

    public resolver ( server:string, app:string|number, wait:WaitConnection ){
        console.log( `server.resolver getaway request from ${ wait.agent } to ${ app}.${ server } connected` );

        let entry = Object.entries( this.serverSlots[server][app] ).find( ([ key, value]) => {
            if( !value ) return false;
            return value.server === server
                && value.app === app
                && !value.busy
        });

        if( entry && entry[1] ){
            console.log( `server.resolver:RESOLVER_IMMEDIATELY ` )
            let next = entry[1];
            next.busy = true;
            delete this.serverSlots[server][app][ next.connect.id() ];
            wait.resolve( next );
            return;
        }
        console.log( `server.resolver:RESOLVER_WAIT` )

        this.waitConnections[server][app][ wait.connection.id() ] = wait;
        wait.connection.on( "close", hadError => {
            console.log( `server.resolver getaway request from ${ wait.agent } to ${ app}.${ server } CLOSED` );
            delete this.waitConnections[server][app][ wait.connection.id()  ];
            if( hadError ) console.log( `detached wait connection for ${ app }.${ server } because remittent connection ${ wait.connection.id() } is closed!`)
        });
    }
}