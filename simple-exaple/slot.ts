import { SocketConnection} from "./share";

export enum SlotName {
    IN="in",
    OUT="out"
}

const OPTS = Symbol( "SlotManager.opts" );
export type SlotManagerOpts<T> = {
    handlerCreator( slotName:SlotName, anchorID:string, ...opts ):Promise<boolean>,
    slots( ...opts ):{ [p in SlotName ]:T[]},
    [p:string]:any
}


export class SlotManager<T extends {busy?:boolean, socket:SocketConnection, id:string }> {
    [OPTS]:SlotManagerOpts<T>;

    constructor( opts:SlotManagerOpts<T>) {
        this[OPTS] = opts;
    }

    nextSlot( slotName:SlotName, anchorID?:string, ...opts ):Promise<T>{
        if( anchorID ){
            let index = this[OPTS].slots( ...opts )[ slotName].findIndex( value => value.id === anchorID );
            let next = this[OPTS].slots( ...opts )[ slotName ][ index ];
            this[OPTS].slots( ...opts)[ slotName ].splice( index, 1 );
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

            while ( !next && this[OPTS].slots( ...opts )[ slotName].length ){
                next = this[OPTS].slots( ...opts )[slotName].shift();
                if( next.busy ) next = null;
            }

            if( _resolve() ) return;
            return this[ OPTS ].handlerCreator( slotName, anchorID, ...opts ).then( created => {
                if( created ) next = this[OPTS].slots( ...opts )[ slotName ].shift();
                if( _resolve() ) return;
                else this.nextSlot( slotName, anchorID ).then( value => {
                    next = value;
                    _resolve()
                });
            })
        });
    }
}
