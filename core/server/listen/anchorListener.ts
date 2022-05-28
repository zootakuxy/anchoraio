import {AIOServer} from "../index";
import net from "net";
import {Anchor} from "../../anchor";
import {AIOSocket} from "../../global/AIOSocket";

export class AnchorListener {
    aioServer: AIOServer;
    server:net.Server
    anchorManager:Anchor;

    constructor( server:AIOServer ) {
        this.aioServer = server;
        this.anchorManager = new Anchor();
        this.server = net.createServer( ( socket)=>{
            let connection = this.aioServer.identifyConnection( socket, "anchor" );
            this.anchorManager.register( connection.socket );
        });
    }

    anchor(from:AIOSocket, to:AIOSocket ){
        return this.anchorManager.anchor( from, to );
    }

    start(){
        this.server.listen( this.aioServer.opts.anchorPort, ()=>{
            console.log( "[ANCHORIO] Server>", `Anchor listener [ON] on port  ${ this.aioServer.opts.anchorPort }`)
        } );
    }

    stop(){
        this.server.close( err => {
            console.log( "[ANCHORIO] Server>", `Anchor listener [OFF] on port ${ this.aioServer.opts.anchorPort }`)
        });
    }
}