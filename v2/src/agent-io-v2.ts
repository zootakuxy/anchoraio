import net from "net";
import {Auth, Redirect} from "./server-io-v2";
import {domainsMap} from "../domains-map";

export type App = {
    name:string,
    host:string,
    port:number,
    releases:number
}
export type AgentOptions = {
    apps: App [],
    serverRequestPort:number,
    serverResponsePort:number,
    serverHost:string,
    anchorPort:number,
    agentName:string
}

export function agent( opts:AgentOptions ){
    let anchor = new net.Server( request => {
        const remoteAddressParts = request.address()["address"].split( ":" );
        const address =  remoteAddressParts[ remoteAddressParts.length-1 ];
        console.log( "NEW REQUEST ON AGENT IN ADDRESS", address );
        let { app, server } = domainsMap[ address ];

        request["connected"] = true;
        request.on("close", hadError => {
            request["connected"] = false;
        })

        //get server and app by address
        let requestData = [];
        let listen = data =>{
            requestData.push( data );
        }
        request.on("data", listen );

        let connect = ()=>{
            let   requestToAnchor = net.connect( {
                host: opts.serverHost,
                port: opts.serverRequestPort
            });

            requestToAnchor.on( "connect", () => {

                //MODO wait response SERVSER
                console.log( "CONNECTED TO REDIRECT ON AGENT", opts.serverRequestPort )
                let redirect:Redirect = {
                    server,
                    app
                }
                requestToAnchor.write( JSON.stringify( redirect ) );

                requestToAnchor.once( "data", ( data ) => {
                    console.log( "AN AGENT REDIRECT READY")
                    while ( requestData.length ){
                        let aData = requestData.shift();
                        requestToAnchor.write( aData );
                    }
                    requestToAnchor.pipe( request );
                    request.pipe( requestToAnchor );
                    request.off( "data", listen );
                    requestToAnchor["anchored"] = true;
                    request["anchored"] = true;
                });

                requestToAnchor.on( "close", hadError => {
                    if( !requestToAnchor["anchored"] && request["connected"]) {
                        setTimeout ( ()=>{
                            connect();
                        }, 1500 );
                    }
                });

                requestToAnchor.on("error", err => {
                    console.log( "request-to-anchor-error", err.message );
                });

                // // MODO noWait response server
                // console.log( "AN AGENT REDIRECT READY")
                // while ( requestData.length ){
                //     let aData = requestData.shift();
                //     requestToAnchor.write( aData );
                // }
                // requestToAnchor.pipe( request );
                // request.pipe( requestToAnchor );
                // request.off( "data", listen );
            });
        };

        request.on( "error", err => {
            console.log( "request-error", err.message );
        });
        connect();


    });

    anchor.listen( opts.anchorPort );
    opts.apps.forEach( value => {
        let release = value.releases;
        if( !release || release < 2 ) release = 2;
        for ( let i = 0; i< release; i++ ){
            openServer( value );
        }
    });

    function openServer ( app:App ){
        let request = net.connect( {
            host: opts.serverHost,
            port: opts.serverResponsePort
        });

        request.on( "connect", () => {
            console.log( "ON CONNECT AGENT APP RESPONSE", app.name, opts.serverResponsePort )
            let auth:Auth = {
                server: opts.agentName,
                app: app.name
            }
            request.write(  JSON.stringify(auth), err => {
                console.log( "ON WRITED!" );
            });
            let datas = [];
            let listen = data =>{
                datas.push( data );
            }

            request.on( "data", listen );
            request.once( "data", data => {
                console.log( "ON REQUEST READY ON AGENT SERVER")
                let appConnection = net.connect({
                    host: app.host,
                    port: app.port
                });
                appConnection.on( "connect", () => {
                    while ( datas.length ){
                        appConnection.write(  datas.shift() );
                    }
                    appConnection.pipe( request );
                    request.pipe( appConnection );
                    request.off( "data", listen );
                });
                appConnection.on( "error", err => {
                    console.log("app-server-error", err.message )
                });
                openServer( app );
                request["anchored"] = true;
            });

            request.on( "error", err => {
                console.log( "response-connect-error", err.message );
            });

            request.on("close", ( error) => {
                if( !request["anchored"] ) setTimeout(()=>{
                    openServer( app );
                }, 1500 );
            });

        });
    }
}

