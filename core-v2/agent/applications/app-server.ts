import {App} from "./app";
import net from "net";
import {BaseEventEmitter} from "kitres/src/core/util";
import {AgentAio} from "../agent-aio";
import {createAnchorConnect, AnchorSocket, identifierOf, anchor, ApplicationGetawayAuth} from "../../net";
import {Defaults} from "../../defaults";

export interface AppProxyEvent{
    onAppRelease( app:App ),
    onAppClosed( app:App )
}

export class AppServer extends BaseEventEmitter<AppProxyEvent>{
    private readonly appsConnections:{
        [ p:string ]:AnchorSocket<{
            appName: string,
            appAddress: string,
            appPort: number,
            appStatus: "started"|"stopped",
            anchorPiped: boolean
    }> };
    private aio:AgentAio;

    constructor( aio:AgentAio ) {
        super()
        this.aio = aio;
        this.appsConnections = {};
    }

    closeApp( app:App ):Promise<AnchorSocket<any>[]>{
        return new Promise( resolve => {
            let sockets = Object.entries( this.appsConnections ).filter( ([id, appSocket], index) => {
                return appSocket.props().appName === app.name;
            }).map( ([id, appSocket]) => appSocket );
            let iCounts = sockets.length;
            sockets.forEach( appSocket => {
                appSocket.props().appStatus = "stopped";
                appSocket.on( "close", hadError => {
                    iCounts--;
                    if( iCounts === 0 ){
                        this.notifySafe( "onAppClosed", app );
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

    public releaseApplication( app:App ){
        console.log( "open-application", app.name, app.address, app.port )
        let releases =app.releases;
        if( !releases ) releases = Defaults.serverRelease||1;
        for ( let i = 0 ; i< releases; i++ ){
            this.openApplication( app )
        }
        this.notify("onAppRelease", app );
    }

    openApplication ( app:App ){
        let responseGetaway = createAnchorConnect(  {
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
            }
        });

        this.appsConnections[ responseGetaway.id() ] = responseGetaway;
        responseGetaway.on( "close", hadError => {
            delete this.appsConnections[ responseGetaway.id() ];
        });

        responseGetaway.on( "connect", () => {
            console.log( "open-getaway-application", app.name, app.address, app.port, "connected" );
            let grants = app.grants;
            if( !grants ) grants = ["*"];
            let auth:ApplicationGetawayAuth = {
                server: identifierOf( this.aio.opts.identifier ),
                app: app.name,
                authReferer: this.aio.authReferer,
                authId: responseGetaway.id(),
                origin: identifierOf( this.aio.opts.identifier ),
                machine: this.aio.machine(),
                grants: grants
            }
            responseGetaway.write(  JSON.stringify(auth));


            let datas = [];
            let listenData = data =>{
                datas.push( data );
            }
            responseGetaway.on( "data", listenData );
            responseGetaway.once( "data", busy => {
                try {
                    let appConnection = createAnchorConnect( {
                        host: app.address,
                        port: app.port,
                        side: "client",
                        method: "RESP",
                    });
                    appConnection.on( "connect", () => {
                        anchor( `${app.name}.${ this.aio.identifier }`, "AGENT-SERVER", responseGetaway, appConnection, datas, [] );
                        responseGetaway.off( "data", listenData );
                        console.log( `new connection with ${ "any" } established for ${ app.name }` );
                    });
                    appConnection.on( "error", err => {
                        console.log("app-server-error", err.message );
                        if( !responseGetaway.anchored() ){
                            responseGetaway.end();
                        }
                    });
                    this.openApplication( app );
                } catch (e) {
                    responseGetaway.end();
                    console.error( e )
                }
            });
        });

        responseGetaway.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        responseGetaway.on("close", ( error) => {
            delete this.appsConnections[ responseGetaway.id() ];
            if( !responseGetaway.anchored() && this.aio.status === "started" && responseGetaway.props().appStatus === "started" ){
                setTimeout(()=>{
                    this.openApplication( app );
                }, this.aio.opts.restoreTimeout)
            }
        });
    }

    stop() {
        Object.entries( this.appsConnections ).forEach( ([key, appConnection], index) => {
            let appName = appConnection.props().appName;
            appConnection.end( ()=>{
                console.log( "application connection end", appName );
            });
        })
    }
}