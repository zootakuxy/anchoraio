import net from "net";
import {Buffer} from "buffer";
import {appLabel} from "../app";


export enum Event {
    AIO="Event.AIO",
    SERVER="Event.SERVER",
    ANCHOR="Event.ANCHOR",
    ANCHOR_CANSEL="Event.ANCHOR_CANSEL",
    ANCHOR_SEND="Event.ANCHOR_SEND",
    REJECTED="Event.REJECTED",
    ACCEPTED="Event.ACCEPTED",
}

export enum Emitter {
    EMITTER_ERROR_REJECTED = "Emitter.EMITTER_ERROR_REJECTED"
}


export function eventCode(type:Event, ...code:string[] ):string {
    return `${type}://${code.join("/")}`;
}


export const showHeader = (any) =>{
    return;
    console.log( `${"".padEnd( 38, "=")} HEADER ${"".padEnd( 38, "=")}` );
    Object.keys( any ).forEach( key => {
        console.log( `${key} `.padEnd( 40, "-" )+"  ", any[ key ])
    });
    console.log( "".padEnd( 84, "=") );
}


export type ChunkLine = { raw:string, chunk:string, header:any, show(), type:(Event|string)[], id?:string,
    as:{
        SERVER: ReturnType<typeof headerMap.SERVER>,
        ANCHOR: ReturnType<typeof headerMap.ANCHOR>,
        AIO: ReturnType<typeof headerMap.AIO>,
    }
};

export function asLine( buffer:Buffer ):ChunkLine[]{
    let raw = buffer.toString().split("\n")
        .filter( (next)=> next && next.length )
        .join("\n");

    return raw.split( "\n" ).filter( next => !!next && !!next?.length).map( (chunk)=>{
        let header
        try{ header = JSON.parse( chunk );}
        catch (e){
            console.log( "--------------------------------------------")
            console.log( raw );
            console.log( "--------------------------------------------")
            console.log( chunk );
            console.error( appLabel(), e );
            console.log( "--------------------------------------------")
            return null;
        }

        return {
            chunk,
            raw,
            header,
            show(){ showHeader( this.header )},
            get type(){
                if( !this.header["type"] ) return []
                else if( typeof this.header["type"] === "string" ) return [ header["type"] ];
                else if( !Array.isArray(this.header["type"]) ) return [ ];
                else return header["type"];
            }, get id(){
                return header[ "id" ];
            }, as:{
                get ANCHOR(){ return headerMap.ANCHOR( header )},
                get SERVER(){ return headerMap.SERVER( header )},
                get AIO(){ return headerMap.AIO( header )}
            }
        }
    }).filter( next=> !!next );
}




export function writeInSocket( socket:net.Socket, data, cb?:( data?:any, socket?:net.Socket )=>void ){
    let _data = data;
    if( typeof data !== "string" ) _data = JSON.stringify( _data );
    socket.write( Buffer.from( _data ), "utf-8"  );
    socket.write( "\n", "utf-8", cb );
}

export type SocketConnection = net.Socket & { id:string, connected:boolean }


type ServerHeader = { origin:string, server:string, id:string };
type AnchorHeader = { origin:string, request:string, server:string, application:string|number, anchor_to?:string, anchor_form: string, domainName:string, port:number };
type AIOHeader = { slot:string, origin:string, server:string, agent: string, anchors:string[], slotCode:string, id:string};

function _header<T>( type:Event, opts:T, ...types:(Event|string)[]  ):T &{type:Event|string[]}{
    return Object.assign( {}, opts, {
        type:[ ...types, type ]
    })
}
export const headerMap = {
    SERVER(opts:ServerHeader, ...types:(Event|string)[]){
        return _header( Event.SERVER, opts, ...types );

    },ACCEPTED(opts:ServerHeader, ...types:(Event|string)[]){
        return _header( Event.ACCEPTED, opts, ...types );

    }, ANCHOR( opts:AnchorHeader, ...types:(Event|string)[]){
        return _header( Event.ANCHOR, opts, ...types );

    }, REJECTED( opts:ServerHeader, ...types:(Event|string)[]){
        return _header( Event.REJECTED, opts, ...types );

    }, ANCHOR_CANSEL(opts:AnchorHeader, ...types:(Event|string)[]){
        return _header( Event.ANCHOR_CANSEL, opts, ...types );

    }, ANCHOR_SEND(opts:AnchorHeader, ...types:(Event|string)[]){
        return _header( Event.ANCHOR_SEND, opts, ...types );

    }, AIO(opts:AIOHeader, ...types:(Event|string)[]){
        return _header( Event.AIO, opts, ...types );
    }
}

