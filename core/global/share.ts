import {AioType, NeedAnchorOpts} from "../aio/anchor-server";
import e from "express";

export enum Event {
    AIO="Event.AIO",
    AIO_CANCELLED="Event.AIO_CANCELLED",
    AIO_SEND="Event.AIO_SEND",
    AIO_REJECTED="Event.AIO_REJECTED",
    AIO_ANCHORED="Event.AIO_ANCHORED",
    AIO_RESTORE="Event.AIO_RESTORE",

    SLOTS="Event.SLOTS",
    CHANEL_FREE="Event.CHANEL_FREE",

    AUTH_ACCEPTED="Event.AUTH_ACCEPTED",
    AUTH_REJECTED="Event.AUTH_REJECTED",
    AUTH_CHANEL="Event.AUTH_CHANEL",

}

export function eventCode(type:Event, ...code:string[] ):string {
    return `${type}://${code.join("/")}`;
}

export interface AuthHeader { token:string, origin:string, server:string, level:"primary"|"secondary", referer?:string }
export interface ServerChanel { origin:string, server:string, id:string, referer }
export interface AioHeader { origin:string, request:string, server:string, application:string|number, anchor_to?:string, anchor_form: string, domainName:string }

export interface RestoreOpts {
    request:string
}

export interface SlotHeader {
    aioType:AioType,
    origin:string,
    anchors:string[],
    busy?:string,
    restore?:RestoreOpts
    needOpts:NeedAnchorOpts,
}

function _header<T>( opts:T  ):T {
    return Object.assign( {}, opts )
}
export const headerMap = {
    AUTH(opts:AuthHeader ){
        return _header( opts  );

    }, CHANEL_FREE( opts:ServerChanel ){
        return _header( opts );

    },AUTH_ACCEPTED(opts:AuthHeader ){
        return _header(  opts );

    }, AIO(opts:AioHeader ){
        return _header( opts );

    }, AUTH_REJECTED(opts:AuthHeader ){
        return _header( opts );

    }, AIO_CANSEL(opts:AioHeader ){
        return _header( opts );

    }, AIO_SEND(opts:AioHeader ){
        return _header( opts );

    }, SLOTS(opts:SlotHeader ){
        return _header(  opts );
    }
}

