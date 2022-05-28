import net from "net";
import {Buffer} from "buffer";
import {appLabel} from "../app";
import {SlotType} from "./slot";


export enum Event {
    AIO="Event.AIO",
    AIO_CANSEL="Event.AIO_CANSEL",
    AIO_SEND="Event.AIO_SEND",

    SLOTS="Event.SLOTS",
    CHANEL_FREE="Event.CHANEL_FREE",

    AUTH="Event.AUTH",
    AUTH_ACCEPTED="Event.AUTH_ACCEPTED",
    AUTH_REJECTED="Event.AUTH_REJECTED",
    AUTH_CHANEL="Event.AUTH_CHANEL",

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
        AUTH: ReturnType<typeof headerMap.AUTH>,
        AUTH_CHANEL: ReturnType<typeof headerMap.AUTH_CHANEL>,
        AIO: ReturnType<typeof headerMap.AIO>,
        SLOTS: ReturnType<typeof headerMap.SLOTS>,
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
                get AIO(){ return headerMap.AIO( header )},
                get AUTH(){ return headerMap.AUTH( header )},
                get AUTH_CHANEL(){ return headerMap.AUTH_CHANEL( header )},
                get SLOTS(){ return headerMap.SLOTS( header )}
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

export interface ServerHeader { origin:string, server:string, id:string };
export interface ServerChanel { origin:string, server:string, id:string, referer };
export interface AnchorHeader { origin:string, request:string, server:string, application:string|number, anchor_to?:string, anchor_form: string, domainName:string };
export interface AIOHeader    { slot:SlotType, origin:string, server:string, agent: string, anchors:string[], slotCode:string, id:string};

function _header<T>( type:Event, opts:T, ...types:(Event|string)[]  ):T &{type:Event|string[]}{
    return Object.assign( {}, opts, {
        type:[ ...types, type ]
    })
}
export const headerMap = {
    AUTH(opts:ServerHeader, ...types:(Event|string)[]){
        return _header( Event.AUTH, opts, ...types );

    }, AUTH_CHANEL(opts:ServerChanel, ...types:(Event|string)[]){
        return _header( Event.AUTH_CHANEL, opts, ...types );

    }, CHANEL_FREE( opts:ServerChanel, ...types:(Event|string)[]){
        return _header( Event.CHANEL_FREE, opts, ...types );

    },AUTH_ACCEPTED(opts:ServerHeader, ...types:(Event|string)[]){
        return _header( Event.AUTH_ACCEPTED, opts, ...types );

    }, AIO(opts:AnchorHeader, ...types:(Event|string)[]){
        return _header( Event.AIO, opts, ...types );

    }, AUTH_REJECTED(opts:ServerHeader, ...types:(Event|string)[]){
        return _header( Event.AUTH_REJECTED, opts, ...types );

    }, AIO_CANSEL(opts:AnchorHeader, ...types:(Event|string)[]){
        return _header( Event.AIO_CANSEL, opts, ...types );

    }, AIO_SEND(opts:AnchorHeader, ...types:(Event|string)[]){
        return _header( Event.AIO_SEND, opts, ...types );

    }, SLOTS(opts:AIOHeader, ...types:(Event|string)[]){
        return _header( Event.SLOTS, opts, ...types );
    }
}

