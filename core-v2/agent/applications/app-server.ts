import {App} from "./app";
import {BaseEventEmitter, Listener} from "kitres/src/core/util";
import {AgentAio} from "../agent-aio";
import {
    anchor,
    AnchorSocket,
    ApplicationGetawayAuth,
    createAnchorConnect,
    createListenableAnchorConnect,
    identifierOf, SlotBusy
} from "../../net";
import {Defaults} from "../../defaults";

export interface AppProxyEvent{
    applicationReleased(app:App ),
    applicationStopped(app:App )
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
    anchorPiped: boolean,
    busy:boolean,
    app: App
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
        console.log( "AppServer:releaseApplication", app.name, app.address, app.port )

        let releases =app.releases;
        if( !releases ) releases = Defaults.serverRelease||1;

        if( !this.apps[ app.name ] ) {
            this.apps[ app.name ] = {
                releases: app.releases,
                name: app.name,
                interval: null,
                status: "started"
            }
        }

        this.restoreApplication( app );
        this.notify("applicationReleased", app );
    }

    openApplication ( app:App ){
        console.log( `agent.openApplication application = "${ app.name }"`)
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
            endpoint: false,
            props: {
                appName: app.name,
                appAddress: app.address,
                appPort: app.port,
                anchorPiped: false,
                busy: false,
                app: app
            }
        });

        let cansel = ( message:string)=>{
            console.log( `agent.openApplication:cansel message = "${ message }"`)
        }

        if( Object.entries( this.appsConnections ).map( ([key, value]) => value).filter( value => {
            return !value.anchored()
                && value.status() !== "connected"
                && !value.props().busy
        }).length >= app.releases ) return cansel( "All application slots opened" );

        let appController = this.apps[ app.name ];
        if( !appController ) return cansel( "No application controller defined!" );

        this.appsConnections[ responseGetaway.id() ] = responseGetaway;
        responseGetaway.on( "close", hadError => {
            delete this.appsConnections[ responseGetaway.id() ];
        });

        responseGetaway.on( "connect", () => {
            console.log( `agent.openApplication:connect application = "${ app.name }"`)
            let grants = app.grants;
            if( !grants ) grants = ["*"];


            responseGetaway.send( "auth", {
                server: identifierOf( this.aio.opts.identifier ),
                app: app.name,
                authReferer: this.aio.authReferer,
                authId: responseGetaway.id(),
                origin: identifierOf( this.aio.opts.identifier ),
                machine: this.aio.machine(),
                grants: grants,
                slotId: responseGetaway.id()
            });
            responseGetaway.stopListener();

            let datas = [];
            let listenData = data =>{
                datas.push( data );
            }
            responseGetaway.on( "data", listenData );

            responseGetaway.once("data", ( origin )=>{
                console.log( `agent.openApplication:busy application = "${ app.name }"`)
                // responseGetaway.onceRaw(  raw => {
                    responseGetaway.props().busy = true;
                    this.restoreApplication( app );

                    console.log( `agent.openApplication:work application = "${ app.name }"`)
                    let appConnection = createAnchorConnect( {
                        host: app.address,
                        port: app.port,
                        side: "client",
                        method: "RESP",
                        endpoint: "server"
                    });

                    appConnection.on( "connect", () => {
                        anchor( `${app.name}.${ this.aio.identifier }`, "AGENT-SERVER", responseGetaway, appConnection, datas, [] );
                        responseGetaway.offRaw( listenData );
                        responseGetaway.stopListener();
                        console.log( `new connection with ${ "any" } established for ${ app.name }` );
                    });

                    // appConnection.on( "data", data => {
                    //     console.log( "=================== [ AGENT:RESPONSE FOR APPLICATION SERVER ] ===================")
                    //     console.log( data.toString() );
                    //     console.log( "=================== [                                       ] ===================")
                    // });
                    appConnection.on( "error", err => {
                        console.log("app-server-error", err.message );
                        if( !responseGetaway.anchored() ){
                            responseGetaway.end();
                        }
                    });
                // });
            })
        });

        responseGetaway.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        responseGetaway.on("close", ( error) => {
            delete this.appsConnections[ responseGetaway.id() ];
            // if(
            //     !responseGetaway.anchored()
            //     && this.aio.status === "started"
            //     && responseGetaway.props().appStatus === "started"
            //     && this.apps?.[ responseGetaway.props().appName ]?.status === "started"
            // ){
            //     setTimeout(()=>{
            //         console.log( `RESTORE CONNECTION FOR: ${ app.name }` );
            //         this.restoreApplication( app );
            //     }, this.aio.opts.restoreTimeout );
            // }

            setTimeout(()=>{
                console.log( `RESTORE CONNECTION FOR: ${ app.name }` );
                this.restoreApplication( app );
            }, this.aio.opts.restoreTimeout );
        });
    }

    private restoreApplication( app:App ){
        if( this.apps[ app.name ].status === "stopped" ) return;
        let pendentConnections = Object.values( this.appsConnections )
            .filter( value => value.status() === "connected"
                && !value.anchored()
                && !value.props().busy
            );

        if( pendentConnections.length >= app.releases ) return;

        if( pendentConnections.length < app.releases ){
            for (let i = 0; i < app.releases - pendentConnections.length; i++) {
                this.openApplication( app );
            }
        }
    }

    closeApp( app:App ):Promise<AnchorSocket<any>[]>{
        return new Promise( resolve => {
            if( !this.apps[ app.name ] ){
                this.apps[ app.name ] ={
                    status: "started",
                    name: app.name,
                    releases: app.releases,
                    interval: null
                }
            }

            this.apps[ app.name ].status = "stopped";

            let sockets = Object.entries( this.appsConnections ).filter( ([id, appSocket], index) => {
                return appSocket.props().appName === app.name;
            }).map( ([id, appSocket]) => appSocket );
            let iCounts = 0;
            sockets.forEach( appSocket => {
                appSocket.end( () => {
                    iCounts++;
                    if( iCounts < sockets.length ) return;
                    console.log( "application connection end", appSocket.props().appName );
                    this.notifySafe( "applicationStopped", app );
                    resolve( sockets );
                });
                delete this.appsConnections[ appSocket.id() ]
            });

        })
    }

    closeAll() {
        let apps = [...new Set(Object.entries( this.appsConnections ).map( ([key, appConnection], index) => {
            return appConnection.props();
        }))];
        apps.forEach( application => this.closeApp( application.app ))
    }

    stop() {
        this.closeAll();
    }

    bused( busy: SlotBusy ) {
        console.log( `agent.busy origin = "${busy.origin}" application = "${busy.application} slotId = "${ busy.slotId }"` );
        let cansel = ( message )=>{
            console.log( `agent.busy:cansel message = "${message}"` );
        }
        let connection = this.appsConnections[ busy.slotId ];
        if( !connection ) return cansel( `No connection for busy`);
        if( connection.props().busy ) return cansel( `Connection already bused!`);
        if( connection.anchored() ) return cansel( "Connection already anchored");
        connection.props().busy = true;
        this.restoreApplication( connection.props().app );
    }
}