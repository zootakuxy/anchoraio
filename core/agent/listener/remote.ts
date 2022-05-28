import {asLine, ChunkLine, Event, headerMap, writeInSocket} from "../../global/share";
import {SlotType} from "../../global/slot";
import net from "net";
import chalk from "chalk";
import {Agent} from "../index";
import {AIOSocket} from "../../global/AIOSocket";

export interface AgentConnection {
    id: string,
    socket:AIOSocket,
    req?:net.Socket,
    busy?:boolean
    anchor( socket:net.Socket ),
}

type Namespace = "agent"|"anchor"|"req"|"chanel";

export class RemoteListener{
    chanel:AgentConnection[] = [];
    agent:Agent

    constructor( agent:Agent) {
        this.agent = agent;
    }

    public registerConnection<T>(socket:net.Socket, namespace:Namespace, collector?:{ [p:string]:AgentConnection }, metadata?:T, ):Promise<AgentConnection>{
        if( !metadata ) metadata = {} as any;

        return new Promise( (resolve) => {
            socket.on("error", err => {});
            socket.once( "data", data => {
                const _data = JSON.parse( data.toString());
                let id = _data.id;
                let _status = { connected: true };
                socket.on( "connect", () => _status.connected = true );
                let connection:AIOSocket&T = Object.assign(socket, metadata, {
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
            host: this.agent.opts.serverHost,
            port: this.agent.opts.serverPort
        });

        socket.on("connect", () => {
            socket["connected"] = true;
            this.registerConnection( socket, namespace ).then( connection => {
                socket["id"] = connection.id;
                if( typeof onConnect === "function" ) onConnect( connection );
            });
        });

        socket.on( "error", err => {
            if( namespace === "agent" ){
                if( this.agent.isConnected ) console.log( "[ANCHORIO] Agent>", `Connection error ${ err.message}` );
                if( this.agent.isConnected && this.agent.authStatus !== "rejected" ) console.log( "[ANCHORIO] Agent>", `Try reconnecting to server!` );
                socket["connected"] = false;

                if( this.agent.authStatus === "rejected" ) return;

                setTimeout( ()=>{
                    socket.connect( this.agent.opts.serverPort );
                }, this.agent.opts.reconnectTimeout )
            }
        });

        socket.on( "close", hadError => {
            socket["connected"] = false;
        })

        socket.on( "data", data => {
            asLine( data ).forEach( (chunkLine) => {
                this.onAgentNextLine( chunkLine );
            });
            if( namespace !== "chanel" ) return;

            writeInSocket( socket, headerMap.CHANEL_FREE({
                origin: this.agent.identifier,
                server: this.agent.identifier,
                id: socket["id"],
                referer: this.agent.id
            }));
        });

        return socket;
    }

    get id(){ return this.agent.id }
    get identifier(){ return this.agent.identifier }

    private createChanel(){
        this.chanel.forEach( chanel => {
            if( chanel.socket.connected ) chanel.socket.end();
        });

        this.chanel.length  = 0;

        for (let i = 0; i < ( this.agent.opts.chanel||5); i++) {
            this.createConnection( "chanel", connection => {
                console.log( "[ANCHORIO] Agent>", `Request new create chanel ${ connection.id}  referer ${this.id}!`  );
                this.chanel.push( connection );
                let pack = {
                    origin: this.identifier,
                    id: connection.id,
                    server: this.identifier,
                    referer: this.id
                }
                writeInSocket( connection.socket, headerMap.AUTH_CHANEL(  pack ) );
            });
        }
    }

    public onAgentNextLine( chunkLine:ChunkLine ){
        chunkLine.show();

        if( chunkLine.type.includes( Event.AIO ) ) {
            this.agent.slotManager.nextSlot( SlotType.ANCHOR_IN, chunkLine.as.AIO.anchor_to ).then(anchor => {
                let appResponse:AIOSocket = this.agent.appManager.connectApplication( chunkLine.as.AIO.application );

                if( appResponse ){
                    this.agent.anchorManager.register( appResponse );
                    this.agent.anchorManager.anchor( anchor.socket, appResponse );
                    console.log( `[ANCHORIO] Agent>`, chalk.blueBright( `Anchor form ${ chunkLine.as.AIO.origin} to application ${ chunkLine.as.AIO.application } \\CONNECTED!` ));
                } else {
                    console.log( `[ANCHORIO] Agent>`, chalk.redBright( `Anchor form ${ chunkLine.as.AIO.origin} to application ${ chunkLine.as.AIO.application } \\CANSELED!` ));
                    anchor.socket.end();
                }
                if( this.agent.slots[SlotType.ANCHOR_IN].length < this.agent.opts.minSlots ) this.agent.createSlots( SlotType.ANCHOR_IN ).then();
            })

        }

        if( chunkLine.type.includes( Event.AIO_SEND )) {
            let request = chunkLine.as.AIO.request;
            let index = this.agent.requests.findIndex( value => value.id === request );
            this.agent.requests[ index ].status = "complete";
            this.agent.requests.splice( index, 1 );
            console.log( "[ANCHORIO] Agent>", chalk.blueBright( "Anchor send!"))
        }

        if( chunkLine.type.includes( Event.AIO_CANSEL ) ){
            let anchorForm = chunkLine.header["anchor_form"];
            let connection = this.agent.anchors[ anchorForm ];
            connection.socket.end();
            connection.req.end();

            let request = chunkLine.as.AIO.request;
            let index = this.agent.requests.findIndex( value => value.id === request );
            this.agent.requests[ index ].status = "complete";
            this.agent.requests.splice( index, 1 );
            console.log( "[ANCHORIO] Agent>", chalk.redBright( "Anchor faild!"))
        }

        if( chunkLine.type.includes( Event.AUTH_REJECTED ) ){
            this.agent.authStatus = "rejected";
            this.agent.id = null;
            this.agent.server["connected"] = false;
            this.agent.server.end();
            console.log( "[ANCHORIO] Agent>", chalk.redBright( "Auth failed with server!"))
        }

        if( chunkLine.type.includes( Event.AUTH_ACCEPTED ) ){
            this.agent.authStatus = "accepted";
            this.agent.createSlots( SlotType.ANCHOR_IN ).then();
            this.agent.createSlots( SlotType.ANCHOR_OUT ).then();
            this.createChanel();
            console.log( "[ANCHORIO] Agent>", chalk.greenBright( "Auth success with server!"))
        }

        if( chunkLine.type.includes( Event.SLOTS ) ){
            let slot = chunkLine.as.SLOTS.slot;
            let slotCode = chunkLine.as.SLOTS.slotCode ;
            this.agent.createSlots( slot, {
                slotCode
            }).catch( reason => {
                // console.error( reason )
            });
            console.log( "[ANCHORIO] Agent>", chalk.blueBright( `Server need more anchor slots ${ slot } code: ${ slotCode }!`))
        }
    }
}