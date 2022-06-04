import {AioAgentConnect} from "./aio-agent-connect";
import {AioAgent} from "./aio-agent";
import {Event, HEADER, SIMPLE_HEADER} from "../global/share";
import chalk from "chalk"
import {AioType} from "../aio/anchor-server";
import {aio} from "../aio/aio";

export class AioAgentListener {
    private readonly _connect:AioAgentConnect;
    private readonly _agent:AioAgent;

    constructor( connect:AioAgentConnect ) {
        this._connect = connect;
        this._agent = connect.agent;
        this.server.onListen( "line", line => {
            // console.log( line );
        });
        // this.server.on( "data", data => console.log( "DATA-AGENT-LISTENER", data.toString() ))
        // this.server.onListen( "chunk", chunk => console.log( "CHUNK-AGENT-LISTENER", chunk ) )
        this.server.onListen( "auth", (identifier, _private) => this.onAgentAuth( identifier, _private) )
        this.server.onListen( Event.SLOTS, ( args ) => this.onSlot( args ) )
        this.server.onListen( Event.AIO, ( args ) => this.onAio( args ) )
        this.server.onListen( Event.AIO_CANCELLED, ( args ) => this.onAioCansel( args ) )

        this.server.onListen( Event.AIO_SEND,  ( args) => {
            this.onAioSend( args );
        } )
        this.server.onListen( Event.AIO_REJECTED, ( args) => {
            this.onAioReject( args );
        });
        this.server.onListen( Event.AIO_ANCHORED, ( args) => this.onAioAnchored( args ) );

        this.server.onListen( "*", (event, args) => {
            if( [Event.AIO_REJECTED, Event.AIO_ANCHORED, Event.AIO_CANCELLED ].includes( event as Event )){
                this.onAioEnd( event as Event, args );
            }
        });
    }

    get server(){ return this._connect.server }

    get connect(): AioAgentConnect {
        return this._connect;
    } get agent(): AioAgent {
        return this._agent;
    }

    private onAgentAuth( identifier, _private:typeof SIMPLE_HEADER.authResult) {
        if( identifier ){
            this.connect.createChanel();
            // this.connect.needAnchor( AioType.AIO_IN ).then()
            // this.connect.needAnchor( AioType.AIO_OUT ).then();
            console.log( "[ANCHORIO] Agent>", `Connected to server aio://${ this.agent.opts.serverHost }:${this.agent.opts.serverPort } with id ${chalk.blueBright(this.connect.id) } ${ chalk.greenBright(`\\AUTHENTICATED-IN-SERVER`)}` );

        } else {
            console.log( "[ANCHORIO] Agent>", chalk.redBright(`Auth rejected from server with message ${ _private } \\REJECTED-IN-SERVER`) );
            this.connect.server.close();
        }
    }
    private onSlot( args:typeof SIMPLE_HEADER.slot) {
        let slot = args.aioType;
        let opts = args.needOpts;
        this.connect.needAnchor( slot, this.agent.identifier, opts ).catch( reason => {});
        console.log( "[ANCHORIO] Agent>", chalk.blueBright( `Server need more anchor slots ${ slot } code: ${ opts.key }!`))
    }

    private onAio( args:typeof SIMPLE_HEADER.aio ) {
        this.agent.anchorServer.nextSlot( AioType.AIO_IN, this.agent.identifier, args.anchor_to ).then( anchor => {
            let application = this.agent.appManager.connectApplication( args );


            if( application ){
                this.agent.anchorServer.anchor( anchor, application, args.request );
                this.connect.server.send( Event.AIO_ANCHORED, args );
                console.log( `[ANCHORIO] Agent>`, `Anchor form ${ args.origin} to application ${ args.application }@${ this.agent.identifier } ${chalk.greenBright("\\CONNECTED!")}` );
            } else {
                console.log( `[ANCHORIO] Agent>`, `Anchor form ${ args.origin} to application ${ args.application }@${ this.agent.identifier } not found connection ${chalk.redBright( "\\REJECTED!")}` );
                this.connect.server.send( Event.AIO_REJECTED, args );
                anchor.close();
            }
        })
    }
    private onAioCansel( args:typeof SIMPLE_HEADER.aio) {
        console.log( `[ANCHORIO] Agent>`, chalk.redBright( `Anchor form ${ args.origin} to application ${ args.application } not found connection \\REJECTED!` ));

    }
    private onAioSend( args:typeof SIMPLE_HEADER.aio ) {
        let request = this.agent.anchorServer.of( args.request );
        if( !request ) return;
    }
    private onAioReject( args:typeof SIMPLE_HEADER.aio) {
        let request = this.agent.anchorServer.of( args.request );
        if( !request ) return;
        request.meta.extras.result = "rejected";
        console.log( `[ANCHORIO] Agent>`, `Anchor form local ${ args.origin } to remote application ${ args.application }@${ args.server } not found connection ${chalk.redBright( "\\REJECTED!")}`);
    }
    private onAioAnchored( args:typeof SIMPLE_HEADER.aio) {
        let request = this.agent.anchorServer.of( args.request );
        if( !request ) return;
        request.meta.extras.result = "success";
        console.log( `[ANCHORIO] Agent>`, `Anchor form local ${ args.origin } to remote application ${ args.application }@${ args.server } not found connection ${chalk.greenBright("\\CONNECTED")}!` );

    }

    private onAioEnd(event: Event, args:typeof SIMPLE_HEADER.aio ) {
        let request = this.agent.anchorServer.of( args.request );
        let anchor = this.agent.anchorServer.of( args.anchor_form );
        if( request ) request.meta.extras.status = "complete";

        // this.agent.anchorServer.ejects( request, anchor );
        if( event !== Event.AIO_ANCHORED ){
            request?.close();
            anchor.close();
        }
    }
}