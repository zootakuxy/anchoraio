import net from "net";

export type ServerOptions = {
    responsePort:number,
    requestPort:number
}

type ServerSlot = {
    server:string,
    app:string,
    busy:boolean,
    connect:net.Socket
};

type WaitConnection = ( slot:ServerSlot )=>void;

export type Auth = {
    server:string
    app:string
}

export type Redirect = {
    server:string
    app:string
}



export function server( opts:ServerOptions){


    let createProxy = ()=>{
        return new Proxy({}, {
            get(target: {}, p: string | symbol, receiver: any): any {
                if( !target[p]) target[p] = new Proxy({}, {
                    get(target: {}, p: string | symbol, receiver: any): any {
                        if( !target[p]) target[p] = new Proxy([], {
                            get(target: any[], p: string | symbol, receiver: any): any {
                                if( p === "push" ){
                                    return ( ... args )=>{
                                        if( !args[0] ) throw new Error("sdsdsdsdsd");
                                        return target.push( ...args );
                                    }
                                }
                                return target[p];
                            }
                        });
                        return target[p];
                    }
                })
                return target[p];
            }
        })
    }

    let serverSlots:{
        [server:string]:{
            [app:string]:ServerSlot[]
        }
    } = createProxy();

    let waitConnections:{
        [server:string]:{
            [app:string]:WaitConnection[]
        }
    } = createProxy()

    let release = ( slot:ServerSlot )=>  {
        let next = waitConnections[slot.server][slot.app].shift();
        if( typeof next === "function" ) {
            next( slot );
            return;
        }
        serverSlots[ slot.server ][ slot.app ].push( slot );
    }

    let connect = ( server:string, app:string, callback:WaitConnection )=>{
        if( !serverSlots[server][app] ) throw new Error("sdsdsds")
        let next = serverSlots[server][app].find( value => {
            if( !value ) return false;
            return value.server === server
                && value.app === app
                && !value.busy
        });

        if( next ){
            next.busy = true;
            let index = serverSlots[server][app].indexOf( next );
            delete serverSlots[server][app][index];
            callback( next );
            return;
        }
        waitConnections[server][app].push( callback );
    }

    let clientOrigin = net.createServer( socket => {
        console.log( "NEW CLIENT REQUEST ON SERVER", opts.requestPort );
        socket.on("data", data => console.log( "DDDDDDDD", data.toString()))
        socket.once( "data", data => {
            console.log( "ON SERVER REDIRECT", data.toString() );
            let redirect:Redirect = JSON.parse( data.toString() );
            let datas = [];
            let listen = data =>{
                datas.push( data );
            }
            socket.on( "data", listen );

            connect( redirect.server, redirect.app, slot => {
                while ( datas.length ){
                    console.log("dsds dsd sd sdsdsds");
                    slot.connect.write(  datas.shift() );
                }
                slot.connect.pipe( socket );
                socket.pipe( slot.connect );
                socket.off( "data", listen );
                socket.write( "ready" );
                console.log( "SERVER REDIRECT READY")
            });
        });
    });

    let serverDestine = net.createServer( socket => {
        console.log( "NEW SERVER RELEASE ON SEVER" );
        socket.once( "data", data => {
            let pack:Auth = JSON.parse( data.toString());
            release( {
                app: pack.app,
                server: pack.server,
                busy: false,
                connect: socket
            });
            console.log( "ON SERVER AGENT READY", data.toString())
        });
    });

    serverDestine.listen( opts.responsePort );
    clientOrigin.listen( opts.requestPort );
}