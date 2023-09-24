import {ServerAio, ServerSlot} from "../server-aio";
import {createServer, Server} from "net";
import {anchor, asAnchorConnect, RequestGetawayAuth} from "../../net";
import {BaseEventEmitter} from "kitres/src/core/util";

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
            let socket = asAnchorConnect( _so, {
                side: "server",
                method: "GET",
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

                let auth = Object.entries( this.saio.agents )
                    .map( value => value[1])
                    .find( (agentAuth, index) => {
                        return agentAuth.referer === redirect.authReferer
                            && agentAuth.agent === redirect.origin
                            && agentAuth.machine === redirect.machine
                    })
                if(!auth ) return end( "3001","Agent not authenticated" );
                let resolverApp = this.saio.agents?.[ redirect.server ]?.apps?.[ redirect.app ];
                if( !resolverApp ) return end( "3002", "Resolved application not found");
                let grants = [ "*", redirect.origin ].find( value => resolverApp.grants.includes( value ) )
                if( !grants ) return end(  "3003", "Permission dined for application");

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
                    agent: auth.agent,
                    resolve: ( slot )=>{
                        anchor( `${redirect.app}.${redirect.server}`, "CENTRAL", socket, slot.connect, datas, [] );
                        socket.off( "data", listen );
                        socket.write("ready" );
                        this.saio.agents[ slot.server ].connection.send( "busy", {
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
    }

    public listen( port:number ){
        this.requestServer.listen( port );
    }
}