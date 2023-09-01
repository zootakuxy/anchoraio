import net from "net";
import {Auth, Redirect} from "./server-io-v2";
import {domainsMap} from "./domains-map";

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

        //get server and app by address
        let requestData = [];
        let listen = data =>{
            requestData.push( data );
        }
        request.on("data", listen );
        // request.on("data", data => {
        //     console.log(  `REGISTER-DATA:\n ${ data.toString()}` )
        // })

        let next = net.connect( {
            host: opts.serverHost,
            port: opts.serverRequestPort
        });

        next.on( "connect", () => {
            console.log( "CONNECTED TO REDIRECT ON AGENT", opts.serverRequestPort )

            next.once( "data", ( data ) => {
                console.log( "AN AGENT REDIRECT READY" );

                while ( requestData.length ){
                    let aData = requestData.shift();
                    next.write( aData );
                }
                next.pipe( request );
                request.pipe( next );
                request.off( "data", listen );
            });
            let redirect:Redirect = {
                server,
                app
            }
            next.write( JSON.stringify( redirect ) );
        });
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
        let next = net.connect( {
            host: opts.serverHost,
            port: opts.serverResponsePort
        });

        next.on( "connect", () => {
            console.log( "ON CONNECT AGENT APP RESPONSE", app.name, opts.serverResponsePort )
            let auth:Auth = {
                server: opts.agentName,
                app: app.name
            }
            next.write(  JSON.stringify(auth));
            let datas = [];
            let listen = data =>{
                datas.push( data );
            }

            next.on( "data", listen );
            next.once( "data", data => {
                let appConnection = net.connect({
                    host: app.host,
                    port: app.port
                });
                appConnection.on( "connect", () => {
                    while ( datas.length ){
                        appConnection.write(  datas.shift() );
                    }
                    appConnection.pipe( next );
                    next.pipe( appConnection );
                    next.off( "data", listen );
                });

                openServer( app );
            });
        });
    }
}

