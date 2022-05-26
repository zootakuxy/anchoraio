import {asLine, ChunkLine, Event, headerMap, SocketConnection, writeInSocket} from "../../global/share";
import {SlotType} from "../../global/slot";
import net from "net";
import chalk from "chalk";
import {createConnection} from "../apps";
import {agent} from "../index";

export interface AgentConnection {
    id: string,
    socket:SocketConnection,
    req?:net.Socket,
    busy?:boolean
    anchor( socket:net.Socket ),
}

type Namespace = "agent"|"anchor"|"req"|"chanel";

export const remoteListener = new ( class RemoteListener{
    chanel:AgentConnection[] = [];

    public registerConnection<T>(socket:net.Socket, namespace:Namespace, collector?:{ [p:string]:AgentConnection }, metadata?:T, ):Promise<AgentConnection>{
        if( !metadata ) metadata = {} as any;
        return new Promise( (resolve) => {
            socket.once( "data", data => {
                const _data = JSON.parse( data.toString());
                let id = _data.id;
                let _status = { connected: true };
                socket.on( "connect", () => _status.connected = true );
                let connection:SocketConnection&T = Object.assign(socket, metadata, {
                    id,
                    get connected(){ return _status.connected;}
                });

                let result:AgentConnection = {
                    id: id,
                    socket: connection,
                    anchor( req){
                        this.req = req;
                        if( req ){
                            req.pipe( socket );
                            socket.pipe( req );
                        }
                    }
                }
                if( !!collector ) collector[ id ] = result;
                socket.on( "close", hadError => {
                    _status.connected = false
                    if( collector ) delete collector[ id ];

                    if( namespace === "agent" ){
                        this.chanel.forEach( chanel => {
                            chanel.socket.end();
                        });
                    }
                })
                resolve( result )
            });
        })
    }

    public createConnection( namespace:Namespace, onConnect:( connection:AgentConnection )=>void){
        let socket =  net.createConnection({
            host: agent.opts.serverHost,
            port: agent.opts.serverPort
        });

        socket.on("connect", () => {
            socket["connected"] = true;
            this.registerConnection( socket, namespace ).then( connection => {
                socket["id"] = connection.id;
                if( typeof onConnect === "function" ) onConnect( connection );
            });
        });

        socket.on( "error", err => {
            if( agent.isConnected ) console.log( "[ANCHORAIO] Agent>", `Connection error ${ err.message}` );
            if( agent.isConnected && agent.authStatus !== "rejected" ) console.log( "[ANCHORAIO] Agent>", `Try reconnecting to server!` );
            socket["connected"] = false;

            if( agent.authStatus === "rejected" ) return;

            setTimeout( ()=>{
                socket.connect( agent.opts.serverPort );
            }, agent.opts.reconnectTimeout )
        });

        socket.on( "close", hadError => {
            socket["connected"] = false;
        })

        socket.on( "data", data => {
            asLine( data ).forEach( (chunkLine) => {
                remoteListener.onAgentNextLine( chunkLine );
            });
            if( namespace !== "chanel" ) return;

            writeInSocket( socket, headerMap.CHANEL_FREE({
                origin: agent.identifier,
                server: agent.identifier,
                id: socket["id"],
                referer: agent.id
            }));
        });

        return socket;
    }

    get id(){ return agent.id }
    get identifier(){ return agent.identifier }

    private createChanel(){
        this.chanel.forEach( chanel => {
            if( chanel.socket.connected ) chanel.socket.end();
        });

        this.chanel.length  = 0;

        for (let i = 0; i < (agent.opts.chanel||5); i++) {
            this.createConnection( "chanel", connection => {
                console.log( "[ANCHORAIO] Agent>", `Request new create chanel ${ connection.id}  referer ${this.id}!`  );
                this.chanel.push( connection );
                let pack = {
                    origin: this.identifier,
                    id: connection.id,
                    server: this.identifier,
                    referer: this.id
                }
                writeInSocket( connection.socket, headerMap.SERVER_CHANEL(  pack ) );
            });
        }
    }

    public onAgentNextLine( chunkLine:ChunkLine ){
        chunkLine.show();

        if( chunkLine.type.includes( Event.ANCHOR ) ) {
            agent.slotManager.nextSlot( SlotType.ANCHOR_IN, chunkLine.as.ANCHOR.anchor_to ).then(anchor => {
                let appResponse:net.Socket = createConnection( chunkLine.as.ANCHOR.application );

                if( appResponse ){
                    appResponse.pipe( anchor.socket );
                    anchor.socket.pipe( appResponse );
                    console.log( `[ANCHORAIO] Agent>`, chalk.blueBright( `Anchor form ${ chunkLine.as.ANCHOR.origin} to application ${ chunkLine.as.ANCHOR.application } \\CONNECTED!` ));
                } else {
                    console.log( `[ANCHORAIO] Agent>`, chalk.redBright( `Anchor form ${ chunkLine.as.ANCHOR.origin} to application ${ chunkLine.as.ANCHOR.application } \\CANSELED!` ));
                    anchor.socket.end();
                }
                if( agent.slots[SlotType.ANCHOR_IN].length < agent.opts.minSlots ) agent.createSlots( SlotType.ANCHOR_IN ).then();
            })

        }

        if( chunkLine.type.includes( Event.ANCHOR_SEND )) {
            let request = chunkLine.as.ANCHOR.request;
            let index = agent.requests.findIndex( value => value.id === request );
            agent.requests[ index ].status = "complete";
            agent.requests.splice( index, 1 );
            agent.nextAnchor();
            console.log( "[ANCHORAIO] Agent>", chalk.blueBright( "Anchor send!"))
        }

        if( chunkLine.type.includes( Event.ANCHOR_CANSEL ) ){
            let anchorForm = chunkLine.header["anchor_form"];
            let connection = agent.anchors[ anchorForm ];
            connection.socket.end();
            connection.req.end();

            let request = chunkLine.as.ANCHOR.request;
            let index = agent.requests.findIndex( value => value.id === request );
            agent.requests[ index ].status = "complete";
            agent.requests.splice( index, 1 );
            agent.nextAnchor();
            console.log( "[ANCHORAIO] Agent>", chalk.redBright( "Anchor faild!"))
        }

        if( chunkLine.type.includes( Event.REJECTED ) ){
            agent.authStatus = "rejected";
            agent.id = null;
            agent.server["connected"] = false;
            agent.server.end();
            console.log( "[ANCHORAIO] Agent>", chalk.redBright( "Auth failed with server!"))
        }

        if( chunkLine.type.includes( Event.ACCEPTED ) ){
            agent.authStatus = "accepted";
            agent.createSlots( SlotType.ANCHOR_IN ).then();
            agent.createSlots( SlotType.ANCHOR_OUT ).then();
            this.createChanel();
            console.log( "[ANCHORAIO] Agent>", chalk.greenBright( "Auth success with server!"))
        }

        if( chunkLine.type.includes( Event.AIO ) ){
            let slot = chunkLine.header[ "slot" ];
            let slotCode = chunkLine.header[ "slotCode" ];
            agent.createSlots( slot, {
                slotCode
            }).catch( reason => {
                // console.error( reason )
            });
            console.log( "[ANCHORAIO] Agent>", chalk.blueBright( `Server need more anchor slots ${ slot } code: ${ slotCode }!`))
        }
    }
})();