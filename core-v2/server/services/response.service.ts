import {ServerAio} from "../server-aio";
import {createServer, Server} from "net";
import {ApplicationGetawayAuth, asListenableAnchorConnect} from "../../net";
import {BaseEventEmitter} from "kitres/src/core/util";

export interface ResponseServiceEvent {
    dined( code:string, message:string, pack:ApplicationGetawayAuth )
    busy( origin:string ),
    auth( authData:ApplicationGetawayAuth )
    error( error:Error, event:"dined"|"busy"|"auth")

}
export class ResponseService extends BaseEventEmitter<ResponseServiceEvent>{
    private saio:ServerAio;
    private responseServer:Server;
    constructor( saio:ServerAio ) {
        super();
        this.saio = saio;
        this.__init();
    }

    private __init(){
        this.responseServer = createServer(_so => {
            let socket = asListenableAnchorConnect<any,{
                busy( origin:string ),
                auth( authData:ApplicationGetawayAuth )
            }>( _so, {
                side: "server",
                method: "SET",
                endpoint: false
            });

            socket.eventListener().once( "auth", pack => {
                socket.stopListener();
                let end = ( code:string, message:string)=>{
                    socket.end();
                    this.notifySafe( "dined", code, message, pack )
                        .forEach( value => {
                            if( value.error ) this.notify( "error", value.error, "dined" );
                        })
                }
                let auth = Object.entries( this.saio.agents )
                    .map( value => value[1] ).find( (agentAuth, index) => {
                        if( agentAuth.referer === pack.authReferer
                            && agentAuth.agent === pack.origin
                            && agentAuth.machine === pack.machine
                        ) return agentAuth;
                        return null;
                    });


                if(!auth ) return end( "2001", "Reference server is not authenticated!" );
                auth.apps[ pack.app ] = {
                    grants: pack.grants,
                    name: pack.app,
                    status: "online"
                }

                this.notifySafe("auth", pack )
                    .forEach( value => {
                        if( value.error ) this.notify( "error", value.error, "auth" );
                    });

                this.saio.release( {
                    app: pack.app,
                    server: pack.server,
                    grants: pack.grants,
                    busy: false,
                    connect: socket,
                    slotId: pack.slotId
                });
            });

            socket.on( "error", err => {
                console.log( "serverDestine-error", err.message )
            })
        });
    }

    listen( port:number ){
        this.responseServer.listen( port );
    }
}