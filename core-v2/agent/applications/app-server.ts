import {App} from "./app";
import {BaseEventEmitter} from "kitres/src/core/util";
import {AgentAio} from "../agent-aio";
import {anchor, AnchorSocket, ApplicationGetawayAuth, createAnchorConnect, identifierOf} from "../../net";
import {Defaults} from "../../defaults";

export interface AppProxyEvent{
    onAppRelease( app:App ),
    onAppClosed( application:string )
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

    closeApp( application:string ):Promise<AnchorSocket<any>[]>{
        return new Promise( resolve => {
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