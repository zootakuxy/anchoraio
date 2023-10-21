import {ServerAio, ServerSlot} from "../server-aio";
import {createServer, Server} from "net";
import {anchor, asAnchorConnect, RequestGetawayAuth} from "../../net";
import {BaseEventEmitter} from "kitres";

export interface RequesterServiceEvent {
    dined( code:string, message:string )
    request( redirect:RequestGetawayAuth )
    resolve( redirect:RequestGetawayAuth, slot: ServerSlot )
    error( error:Error, event:"dined"|"request"|"resolve")
}

export class RequesterService extends BaseEventEmitter<RequesterServiceEvent>{
    private saio:ServerAio;
    private requestServer:Server;
    constructor( saio:ServerAio ) {
        super();
        this.saio = saio;
        this.__init();
    }

    private __init(){
        this.requestServer = createServer(_so => {
            let socket: (typeof this.saio.waitConnections)[string][string][string]["connection"]= asAnchorConnect( _so, {
                side: "server",
                method: "GET",
                endpoint: false
            });
            socket.once( "data", ( data) => {

                let str = data.toString();

                //Modo waitResponse server
                let redirect:RequestGetawayAuth = JSON.parse( str );

                let end = ( code:string, message:string )=>{
                    console.log( `server.requestGetawaySever:end massage = "${message}"`)
                    socket.end();
                    this.notifySafe("dined", code, message ).forEach( value => {
                        if( value.error ) this.notifySafe("error", value.error, "dined" );
                    })
                }

                let auth = Object.values( this.saio.agents )
                    .find( (agentAuth, index) => {
                        return agentAuth.props().referer === redirect.authReferer
                            && agentAuth.props().agent === redirect.origin
                            && agentAuth.props().machine === redirect.machine
                    })
                if(!auth ) return end( "3001","Agent not authenticated" );
                let resolveServer = this.saio.agents?.[ redirect.server ];
                if( !resolveServer ) return end( "3002",  `Resolve server "${ redirect.server}" not found or offline` );
                let resolverApp = resolveServer?.props?.()?.apps?.[ redirect.app ];
                if( !resolverApp ) return end( "3003", "Resolved application not found");
                let grants = [ "*", redirect.origin ].find( value => resolverApp.grants.includes( value ) )
                if( !grants ) return end(  "3004", "Permission dined for application");

                socket.props().client = auth.props().agent;

                let datas = [];
                let listen = data =>{
                    datas.push( data );
                }
                socket.on( "data", listen );

                this.notifySafe( "request", redirect ).forEach( value => {
                    if( value.error ) this.notifySafe("error", value.error, "request" );
                });

                this.saio.resolver( redirect.server, redirect.app, {
                    id: socket.id(),
                    connection: socket,
                    agent: auth.props().agent,
                    resolve: ( slot )=>{
                        anchor( `${redirect.app}.${redirect.server}`, "CENTRAL", socket, slot.connect, datas, [] );
                        socket.off( "data", listen );
                        socket.write("ready" );
                        this.saio.agents[ slot.server ].send( "busy", {
                            application: redirect.app,
                            slotId: slot.slotId,
                            origin: redirect.origin
                        });
                        this.notifySafe( "resolve", redirect, slot ).forEach( value => {
                            if( value.error ) this.notifySafe("error", value.error, "resolve" );
                        })
                    }
                })
            });

            socket.on( "error", err => {
                console.log( "clientOrigin-error", err.message )
            })
        });

        this.requestServer.on( "error", err => {
            console.log(  `Request server error = "${err?.message}"` );
            console.error(  err );
        });
    }

    public listen( port:number ){
        this.requestServer.listen( port );
    }
}