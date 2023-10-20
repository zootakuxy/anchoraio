import {ServerAio} from "../server-aio";
import {createServer, Server} from "net";
import {ApplicationGetawayAuth, asListenableAnchorConnect} from "../../net";
import {BaseEventEmitter} from "kitres/src/core/util";

export interface ResponseServiceEvent {
    dined( code:string, message:string, pack:ApplicationGetawayAuth ):void
    busy( origin:string ):void
    auth( authData:ApplicationGetawayAuth ):void
    error( error:Error, event:"dined"|"busy"|"auth"):void

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
                busy( origin:string ):void
                auth( authData:ApplicationGetawayAuth ):void
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
                let auth = Object.values( this.saio.agents )
                    .find( (agentAuth, index) => {
                        if( agentAuth.props().referer === pack.authReferer
                            && agentAuth.props().agent === pack.origin
                            && agentAuth.props().machine === pack.machine
                        ) return agentAuth;
                        return null;
                    });


                if(!auth ) return end( "2001", "Reference server is not authenticated!" );
                auth.props().apps[ pack.app ] = {
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

        this.responseServer.on( "error",err => {
           console.log( `Response server error = "${err.message}"` );
           console.error( err );
        });
    }

    listen( port:number ){
        this.responseServer.listen( port );
    }
}