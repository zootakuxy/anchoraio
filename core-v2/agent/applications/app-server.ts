import {App} from "./app";
import {BaseEventEmitter, Listener} from "kitres/src/core/util";
import {AgentAio} from "../agent-aio";
import {
    anchor,
    AnchorSocket,
    ApplicationGetawayAuth,
    createAnchorConnect,
    createListenableAnchorConnect,
    identifierOf
} from "../../net";
import {Defaults} from "../../defaults";

export interface AppProxyEvent{
    onAppRelease( app:App ),
    onAppClosed( application:string )
}

export type AppController = {
    status:"started"|"stopped",
    name:string,
    releases: number,
    interval: ReturnType<typeof setInterval>
}

export type ApplicationSocketProps = {
    appName: string,
    appAddress: string,
    appPort: number,
    appStatus: "started"|"stopped",
    anchorPiped: boolean,
    busy:boolean
}
export class AppServer extends BaseEventEmitter<AppProxyEvent>{
    private readonly appsConnections:{
        [ p:string ]:AnchorSocket<ApplicationSocketProps> };
    private aio:AgentAio;
    private readonly apps:  {
      [appName:string]: AppController
    };

    constructor( aio:AgentAio ) {
        super()
        this.aio = aio;
        this.appsConnections = {};
        this.apps = { };
    }


    public releaseApplication( app:App ){
        console.log( "open-application", app.name, app.address, app.port )

        let server = this.aio.availableRemoteServers.find( value => value.server === this.aio.identifier );
        if( !server ) this.aio.availableRemoteServers.push( server = {
            server: this.aio.identifier,
            apps: new Set()
        });
        server.apps.add( app.name );

        let releases =app.releases;
        if( !releases ) releases = Defaults.serverRelease||1;
        for ( let i = 0 ; i< releases; i++ ){
            this.openApplication( app )
        }
        this.notify("onAppRelease", app );
    }

    openApplication ( app:App ){
        let responseGetaway = createListenableAnchorConnect<
            ApplicationSocketProps, {
            busy( origin:string ),
            auth( authData:ApplicationGetawayAuth )
        }
        >(  {
            side: "client",
            method: "SET",
            host: this.aio.opts.serverHost,
            port: this.aio.opts.responsePort,
            props: {
                appName: app.name,
                appAddress: app.address,
                appPort: app.port,
                appStatus: "started" as const,
                anchorPiped: false,
                busy: false
            }
        });

        if( Object.entries( this.appsConnections ).map( ([key, value]) => value).filter( value => {
            return !value.anchored()
                && value.status() !== "connected"
                && !value.props().busy
        }).length >= app.releases ) return;

        let appController = this.apps[ app.name ];
        if( !appController ) return;

        this.appsConnections[ responseGetaway.id() ] = responseGetaway;
        responseGetaway.on( "close", hadError => {
            delete this.appsConnections[ responseGetaway.id() ];
        });

        responseGetaway.on( "connect", () => {
            console.log( "open-getaway-application", app.name, app.address, app.port, "connected" );
            let grants = app.grants;
            if( !grants ) grants = ["*"];

            responseGetaway.send( "auth", {
                server: identifierOf( this.aio.opts.identifier ),
                app: app.name,
                authReferer: this.aio.authReferer,
                authId: responseGetaway.id(),
                origin: identifierOf( this.aio.opts.identifier ),
                machine: this.aio.machine(),
                grants: grants
            });

            responseGetaway.eventListener().once("busy", ( origin )=>{
                responseGetaway.props().busy = true;
                this.openApplication( app );

                let datas = [];
                let listenData = data =>{
                    datas.push( data );
                }
                responseGetaway.onRaw( listenData );
                responseGetaway.onceRaw(  raw => {
                    let appConnection = createAnchorConnect( {
                        host: app.address,
                        port: app.port,
                        side: "client",
                        method: "RESP",
                    });

                    appConnection.on( "connect", () => {
                        anchor( `${app.name}.${ this.aio.identifier }`, "AGENT-SERVER", responseGetaway, appConnection, datas, [] );
                        responseGetaway.offRaw( listenData );
                        responseGetaway.stopListener();
                        console.log( `new connection with ${ "any" } established for ${ app.name }` );
                    });
                    appConnection.on( "error", err => {
                        console.log("app-server-error", err.message );
                        if( !responseGetaway.anchored() ){
                            responseGetaway.end();
                        }
                    });
                });
            })
        });

        responseGetaway.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        responseGetaway.on("close", ( error) => {
            delete this.appsConnections[ responseGetaway.id() ];
            console.log( responseGetaway.props() );
            if(
                !responseGetaway.anchored()
                && this.aio.status === "started"
                && responseGetaway.props().appStatus === "started"
                && this.apps?.[ responseGetaway.props().appName ]?.status === "started"
            ){
                setTimeout(()=>{
                    console.log( `RESTORE CONNECTION FOR: ${ app.name }` );
                    this.openApplication( app );
                }, this.aio.opts.restoreTimeout)
            }
        });
    }

    closeApp( application:string ):Promise<AnchorSocket<any>[]>{
        return new Promise( resolve => {
            if( this.apps[ application ] ){
                this.apps[ application ].status = "stopped";
            }

            let sockets = Object.entries( this.appsConnections ).filter( ([id, appSocket], index) => {
                return appSocket.props().appName === application;
            }).map( ([id, appSocket]) => appSocket );
            let iCounts = sockets.length;
            sockets.forEach( appSocket => {
                appSocket.props().appStatus = "stopped";
                appSocket.on( "close", hadError => {
                    iCounts--;
                    if( iCounts === 0 ){
                        this.notifySafe( "onAppClosed", application );
                        resolve( sockets );
                        return;
                    }
                });
                appSocket.end( () => {
                    console.log( "application connection end", appSocket.props().appName );
                });
            })
        })
    }

    closeAll() {
        let apps = [...new Set(Object.entries( this.appsConnections ).map( ([key, appConnection], index) => {
            return appConnection.props().appName;
        }))];
        apps.forEach( application => this.closeApp( application ))
    }

    stop() {
        this.closeAll();
    }
}