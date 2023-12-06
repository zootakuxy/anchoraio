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
    applicationReleased(app:App ):void,
    applicationStopped(app:App ):void
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
        [ id:string ]:AnchorSocket<ApplicationSocketProps> };
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

        let releases  =app.releases;
        if( !releases ) releases = Defaults.serverRelease||1;

        if( !this.apps[ app.name ] ) {
            this.apps[ app.name ] = {
                releases: releases,
                name: app.name,
                interval: null,
                status: "started"
            }
        }

        this.apps[ app.name ].status = "started";
        this.restoreApplication( app );
        this.notify("applicationReleased", app );
    }

    openApplication ( app:App, free:number, index:number){
        console.log( `agent.openApplication application = "${ app.name } release = "${app.releases}" free = "${ free }" index = "${index}"`)
        let responseGetaway = createListenableAnchorConnect<
            ApplicationSocketProps, {
            busy( origin:string ):void,
            auth( authData:ApplicationGetawayAuth ):void
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

            console.log( `Auth server with authReferer ${ this.aio.authReferer }`)
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
                    responseGetaway.props().busy = true;
                    delete this.appsConnections[ responseGetaway.id() ];
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

                    appConnection.on( "error", err => {
                        console.log("app-server-error", err.message );
                        if( !responseGetaway.anchored() ){
                            responseGetaway.end();
                        }
                    });

            })
        });

        responseGetaway.on( "error", err => {
            console.log( "response-connect-error", err.message );
        });

        responseGetaway.on("close", ( error) => {
            delete this.appsConnections[ responseGetaway.id() ];
            if( !error ) return;
            if( responseGetaway.anchored() ) return;
            if( responseGetaway.props().busy ) return;

            setTimeout(()=>{
                console.log( `RESTORE CONNECTION FOR: ${ app.name } ERROR = "${error}"` );
                this.restoreApplication( app );
            }, this.aio.opts.restoreTimeout );
        });
    }

    public restoreApplication( app:App ){
        if( !app.releases ) app.releases = 1;
        console.log( `[aio:agent] Restore application ${ app.name } | release slots$ { ${ app.releases } }` );
        let cansel = ( message:string, hint? )=>{
            console.log( `agent.restoreApplication message = "${message}"` );
            if ( hint === undefined ) return;
            console.log( `agent.restoreApplication hint`, hint );
        }

        if( this.apps[ app.name ].status === "stopped" ) return cansel( "Application controller stopped");
        let pendentConnections = Object.values( this.appsConnections )
            .filter( connections => connections.props().appName === app.name
                && ( connections.status() === "connected" || !connections.status() || connections.connecting )
                && !connections.anchored()
                && !connections.props().busy
            );

        if( pendentConnections.length >= app.releases ) return cansel( "All pendent slot released" );

        if( pendentConnections.length < app.releases ){
            let free = app.releases - pendentConnections.length;
            console.log( `[aio:agent] Open application  ${ app.name } free ${ free }` );
            for (let i = 0; i < free; i++) {
                this.openApplication( app, free, i );
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
            let isFinally= false;
            Object.values( this.appsConnections ).forEach( (socket, index, array) => {
                isFinally = index+1 === array.length;
                if( socket.props().appName !== app.name ) return;
                socket.props().busy = true;
                socket.end( () => {
                    if( !isFinally ) return false;
                });
                console.log( "application connection end", app.name, socket.id());
                delete this.appsConnections[ socket.id() ]

            });

            console.log( "application connection end", app.name, "[FINALIZED]");
            this.notifySafe( "applicationStopped", app  );
        })
    }

    closeAll():Promise<boolean> {
        return new Promise( resolve => {
            Promise.all(
                this.aio.apps.applications().map( value => {
                    return this.closeApp( value )
                })
            ).then( value => {
                resolve( true );
            }).catch( reason => {
                resolve( false )
            })
        })
    }

    stop() {
        return this.closeAll();
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
        delete this.appsConnections[ connection.id() ];
        this.restoreApplication( connection.props().app );
    }

    statusOf(app: App) {
        let controller = this.apps[ app.name ];
        if( !controller ) return "stopped";
        return controller.status;
    }
}