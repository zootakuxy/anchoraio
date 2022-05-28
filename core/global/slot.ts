import {AIOSocket} from "./AIOSocket";

export enum SlotType {
    ANCHOR_IN="SlotType.ANCHOR_IN",
    ANCHOR_OUT="SlotType.ANCHOR_OUT"
}

const OPTS = Symbol( "SlotManager.opts" );
export type SlotManagerOpts<T> = {
    handlerCreator(slotName:SlotType, anchorID:string, ...opts ):Promise<boolean>,
    slots( ...opts ):{ [p in SlotType ]:T[]},
    [p:string]:any
}


export class SlotManager<T extends {busy?:boolean, socket:AIOSocket, id:string }> {
    [OPTS]:SlotManagerOpts<T>;

    constructor( opts:SlotManagerOpts<T>) {
        this[OPTS] = opts;
    }

    nextSlot(slotType:SlotType, anchorID?:string, ...opts ):Promise<T>{
        if( anchorID ){
            let index = this[OPTS].slots( ...opts )[ slotType].findIndex( value => value.id === anchorID );
            let next = this[OPTS].slots( ...opts )[ slotType ][ index ];
            this[OPTS].slots( ...opts)[ slotType ].splice( index, 1 );
            return Promise.resolve( next );
        }

        return new Promise( (resolve) => {
            let next:T;
            let _resolve = () =>{
                if( !next ) return false;
                if( next.busy ) return false;
                if( !next.socket.connected ) return false;
                next.busy = true;
                resolve( next );
                return  true;
            }

            while ( !next && this[OPTS].slots( ...opts )?.[ slotType].length ){
                next = this[OPTS].slots( ...opts )[slotType].shift();
                if( next.busy ) next = null;
            }

            if( _resolve() ) return;
            return this[ OPTS ].handlerCreator( slotType, anchorID, ...opts ).then( created => {
                if( created ) next = this[OPTS].slots( ...opts )[ slotType ].shift();
                if( _resolve() ) return;
                else this.nextSlot( slotType, anchorID ).then( value => {
                    next = value;
                    _resolve()
                });
            })
        });
    }
}
