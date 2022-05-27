import {ServerOptions} from "../../server/opts";
import {AIOServer} from "../../server";

export class ServerContext{
    server?:AIOServer
    option:ServerOptions

    constructor( opts:ServerOptions ) {
        this.option = opts;
        this.server = new AIOServer( opts );
    }

    start(){
        this.start = ()=>{ console.log( "[ANCHORIO] Server>", `This server context already started!`)}
        this.server.start();
    }

}