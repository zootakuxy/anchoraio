import {Buffer} from "buffer";
import net from "net";
import {AIOSocket, asAIOSocket} from "../global/AIOSocket";
import {nanoid} from "nanoid";

interface Chunk {
    sequence:number,
    buffer:Buffer,
    connection:string
}

export interface AnchorSocket extends AIOSocket {
    pendents:Chunk[],
}

export class Anchor {
    seq:number = 0;
    port:number;
    server:net.Server;
    private _dataListeners:{[p:string]: ( data:Buffer )=>void} = {}
    private _listeners: {
        socket?:( socket:AIOSocket ) => void,
        register?:( socket:AnchorSocket ) => void,
    } = new Proxy({ }, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[ p  ] ) target[ p ]= [];
            return target[ p ];
        }
    })

    constructor( /*port:number, identifier:string, namespace:string*/  ) {
/*        this.port = port;
        this.server = net.createServer( (socket)=>{
            let id = `anchor://${ identifier }:${ namespace }/${ nanoid( 16 )}?${ this.seq ++ }`;
            let aioSocket = asAIOSocket( socket, id );
            let anchorSocket = this.register( aioSocket );
            this._listeners.socket( aioSocket );
        })*/
    }

    register( connection:AIOSocket ):AnchorSocket{
        if( connection["anchor-manager"] ) return;
        let pendents:Chunk[] = connection["pendents"] || [];
        connection["pendents"] = pendents;
        connection["anchor-manager"] = true;
        let dataListener = ( data:Buffer )=>{
            if( connection[ "status" ] !== "anchored" || pendents.length ){
                let pack:Chunk = {
                    sequence: this.seq++,
                    connection: connection.id,
                    buffer: data
                };
                connection[ "pendents" ].push( pack );
            }
        };
        this._dataListeners[ connection.id ] = dataListener;
        connection.on( "data", dataListener );
    }

    anchor(from:AIOSocket, to:AIOSocket ){
        if( from[ "anchor-manager-aio"]) {
            throw new Error( `Connection ${ from.id } already preview anchored!`)
        }

        if( to[ "anchor-manager-aio"]) {
            throw new Error( `Connection ${ to.id } already preview anchored!`)
        }

        from[ "anchor-manager-aio" ] = true;
        to[ "anchor-manager-aio" ] = true;

        let fromPendent:Chunk[] = from["pendents"]||[];
        let toPendent:Chunk[] = to["pendents"]||[];

        from.pipe( to );
        to.pipe( from );

        let reverse = { [from.id]: to, [ to.id]: from };
        while ( toPendent.length > 0 || fromPendent.length > 0 ){
            let next:Chunk;
            if( !toPendent.length ) next = fromPendent.shift();
            else if( !fromPendent.length ) next = toPendent.shift();
            else if( toPendent[0].sequence < fromPendent[0].sequence ) next = toPendent.shift();
            else fromPendent.shift();
            reverse[ next.connection ].write( next.buffer );
        }

        from[ "status" ] = "anchored";
        to[ "status" ] = "anchored";



        from.off( "data", this._dataListeners[ from.id ] );
        to.off( "data", this._dataListeners[ to.id ] );

        delete this._dataListeners[ from.id ];
        delete this._dataListeners[ to.id ];

        from.on( "end", args => {
            if( to.connected ) to.end();
        });

        to.on( "end", ()=>{
            if( from.connected ) from.end();
        });

    }
}