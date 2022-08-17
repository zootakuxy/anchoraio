import {AioAgentConnect} from "./aio-agent-connect";
import {AioAgent} from "./aio-agent";
import {Event, SIMPLE_HEADER} from "../anchor/share";
import chalk from "chalk"
import {AioType} from "../anchor/server";
import {AioSocket} from "../socket/socket";

export class AioAgentListener {
    private readonly _connect:AioAgentConnect;
    private readonly _agent:AioAgent;

    constructor( connect:AioAgentConnect ) {
        this._connect = connect;
        this._agent = connect.agent;
        this.listen( this.server )
    }

    listen( connection: AioSocket<any> ){
        connection.onListen( "auth", (identifier, _private) => this.onAgentAuth( identifier, _private) )
        connection.onListen( Event.SLOTS, ( args ) => this.onSlot( args ) )
        connection.onListen( Event.AIO, ( args ) => this.onAio( args ) )
        connection.onListen( Event.AIO_CANCELLED, ( args ) => this.onAioCansel( args ) )

        connection.onListen( Event.AIO_SEND,  ( args) => {
            this.onAioSend( args );
        } )
        connection.onListen( Event.AIO_REJECTED, ( args) => {
            this.onAioReject( args );
        });
        connection.onListen( Event.AIO_ANCHORED, ( args) => this.onAioAnchored( args ) );
        connection.onListen( Event.AIO_END_ERROR, ( args) => this.onAioEndError( args ) );

        connection.onListen( "*", (event, args) => {
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
            if( this.agent.anchorServer.counts( AioType.AIO_IN, this.agent.identifier ) < this.agent.opts.minSlots ) this.connect.needAnchor( AioType.AIO_IN ).then()
            if( this.agent.anchorServer.counts( AioType.AIO_OUT, this.agent.identifier ) < this.agent.opts.minSlots ) this.connect.needAnchor( AioType.AIO_OUT ).then()
            console.log( "[ANCHORIO] Agent>", `Connected to server aio://${ this.agent.opts.serverHost }:${this.agent.opts.serverPort } with id ${chalk.blueBright(this.connect.id) } ${ chalk.greenBright(`\\AUTHENTICATED-IN-SERVER`)}` );

        } else {
            console.log( "[ANCHORIO] Agent>", chalk.redBright(`Auth rejected from server with message ${ _private.message } \\SERVER REJECTION`) );
            this.connect.server.close();
        }
    }
    private onSlot( args:typeof SIMPLE_HEADER.slot) {
        let slot = args.aioType;
        let opts = args.needOpts;
        this.connect.needAnchor( slot, this.agent.identifier, opts ).catch( reason => {});
        console.log( "[ANCHORIO] Agent>", `Server need more anchor slots ${ chalk.blueBright( slot ) } code: ${ chalk.blueBright( opts.key ) }!`)
    }

    private onAio( args:typeof SIMPLE_HEADER.aio ) {
        this.agent.anchorServer.nextSlot( AioType.AIO_IN, this.agent.identifier, args.anchor_to ).then( anchor => {
            let application = this.agent.appManager.connectApplication( args );

            if( application ){
                this.agent.anchorServer.anchor( anchor, application, args.request, args.application );
                this.connect.server.send( Event.AIO_ANCHORED, args );
                console.log( `[ANCHORIO] Agent>`, `Anchor form ${ args.origin} to application ${ args.application }@${ this.agent.identifier } ${chalk.greenBright("\\CONNECTED!")}` );
            } else {
                console.log( `[ANCHORIO] Agent>`, `Anchor form ${ args.origin} to application ${ args.application }@${ this.agent.identifier } not found connection ${chalk.redBright( "\\REJECTED!")}` );
                this.connect.server.send( Event.AIO_REJECTED, args );
                anchor.close();
            }
        })
    }
    private onAioCansel( args:typeof SIMPLE_HEADER.aio ) {
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
        console.log( `[ANCHORIO] Agent>`, `Anchor form local ${ args.origin } to remote application ${ args.application }@${ args.server } ${chalk.greenBright("\\CONNECTED")}!` );

    }

    private onAioEnd(event: Event, args:typeof SIMPLE_HEADER.aio ) {
        let request = this.agent.anchorServer.of( args.request );
        let anchor = this.agent.anchorServer.of( args.anchor_form );
        if( request ) request.meta.extras.status = "complete";

        if( event !== Event.AIO_ANCHORED ){
            console.log( "[ANCHORIO] Agent>", chalk.redBright( `Request ${ args.request } end without success` ) );
            request?.close();
            anchor.close();
        }
    }

    private onAioEndError( args:typeof SIMPLE_HEADER.aioEndError ) {
        this.agent.anchorServer.filterSocketByMeta( meta => meta.anchorRequest === args.request ).forEach( value => {
            value.close();
        })
    }
}