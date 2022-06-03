import {ServerOptions} from "../../server/opts";
import {AioCentral} from "../../server/aio-central";

export class ServerContext{
    server?:AioCentral
    option:ServerOptions

    constructor( opts:ServerOptions ) {
        this.option = opts;
        this.server = new AioCentral( opts );
    }

    start(){
        this.start = ()=>{ console.log( "[ANCHORIO] Server>", `This server context already started!`)}
        this.server.start();
    }

}