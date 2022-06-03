import {AioType, NeedAnchorOpts} from "../aio/anchor-server";

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

export interface RestoreOpts {
    request:string
}

export const SIMPLE_HEADER = {
    aio: null as {
        origin:string,
        request:string,
        server:string,
        application:string|number,
        anchor_to?:string,
        anchor_form: string,
        domainName:string
    }, authResult: null as {
        private:string,
        anchorPort:number

    }, auth: null as {
        token:string, origin:string, server:string, level:"primary"|"secondary", referer?:string

    }, slot: null as {
        aioType:AioType,
        origin:string,
        anchors:string[],
        busy?:string,
        restore?:RestoreOpts
        needOpts:NeedAnchorOpts,
    }
} as const;


export const HEADER :{ [p in keyof typeof SIMPLE_HEADER ]?:( (args: typeof SIMPLE_HEADER[p]) =>typeof SIMPLE_HEADER[p]) } = new Proxy( {}, {
    get(target: {}, p: keyof typeof SIMPLE_HEADER, receiver: any): any {
        if( !target[ p ] ) target[ p ] = ( args ) => args;
        return target[ p ];
    }, set(target: {}, p: string | symbol, value: any, receiver: any): boolean {
        return true;
    }
});
