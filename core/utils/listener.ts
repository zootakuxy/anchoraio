
function arrayProxy(){
    return new Proxy({}, { get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[ p ] ) target[ p ] = [];
            return target[ p ];
        }});
}

export type ListenerCallback = ( ...any:any )=>any;
export interface ListenerEvent {
    regexp?:RegExp,
    callback:ListenerCallback
}

export class Listener<E extends string> {
    private readonly listen:{
        on: { [ p in string ]?: ListenerEvent[ ]};
        once: { [ p in string ]?:ListenerEvent[ ]}
    }

    constructor( ) {
        this.listen = {
            on: arrayProxy(),
            once: arrayProxy()
        }
    }

    on< C extends ListenerCallback>( event:E|string, regexp:C|RegExp, callback?:C ){
        this.register( "on", event, regexp, callback );
    }
    once< C extends ListenerCallback>( event:E|string, regexp:C|RegExp, callback?:C ){
        this.register( "once", event, regexp, callback );
    }

    register< C extends ListenerCallback>( group:"on"|"once", event:E|string, regexp:C|RegExp, callback?:C ){
        let list = this.listen[group][ event ];
        let _regexp:RegExp;
        let cb:(...data:any)=>any;
        if( typeof regexp === "function" ) cb = regexp;
        else if( typeof callback === "function" ) cb = callback;
        list.push( { regexp: _regexp, callback: cb } );
    }

    notifyAllWith( event:E|string, check:string, ...data ){
        return this.notifySyncWith( `${event}:sync`, check, ...data ).then( value => {
            this.notify( event, ...data )
        })
    }
    notifySyncWith ( event:E|string, check:string, ...data ){
        return Promise.all( [
            this.onceNotifySyncWith( event, check, ...data ),
            this.onNotifySyncWith( event, check, ... data)
        ]).then( value => {

            return Promise.resolve( true );
        });
    }

    notifyAll( event:E|string, ...data ){

        return this.notifySync( `${event}:sync`, ...data ).then( value => {
            this.notify( event, ...data )
        })
    }

    notifySync( event:E|string, ...data ){
        return this.notifySyncWith( event, null, ...data );
    }

    eval( test:string, listener:ListenerEvent, ...data ):any{
        if( test && listener.regexp && !listener.regexp.test( test ) ) return;
        return listener.callback( ...data );
    }

    notifyWith( event:E|string, check:string, ...data ) {
        this.onceNotifyWith(event, check, ...data);
        this.onNotifyWith(event, check, ...data);
    }

    notify( event:E|string, ...data ){
        return this.notifyWith( event, null, ...data );
    }

    onNotifyWith ( event:E|string, check:string, ...data ){
       let list = [ ...this.listen.on[ event ], ...this.listen.on[ "*" ] ];;
       list.forEach( value => this.eval( check, value, ...data ));
    }

    onNotify ( event:E|string, ...data ){
        return this.onNotifyWith( event, null, ...data );
    }

    onceNotifyWith( event:E|string, check:string,  ...data){
        let list = this.listen.once[ event ].splice(0, this.listen.once[ event ].length );
        list.push( ...this.listen.once[ "*"].splice( 0, this.listen.once[ "*"].length ));
        list.forEach( value => this.eval( check, value, ...data ));
    }

    onceNotify( event:E|string,  ...data){
        return this.onceNotifyWith( event, null, ...data );
    }

    onNotifySyncWith ( event:E|string, check, ...data ){
        let list = [ ...this.listen.on[ event ], ...this.listen.on[ "*"] ];
        return this._syncCallbacks( check,  list );
    }

    onNotifySync ( event:E|string, ...data ){
        return this.onNotifySyncWith(  event, null, this.listen.on[ event ] );
    }

    onceNotifySyncWith( event:E|string, check,  ...data){
        let list = this.listen.once[ event ].splice( 0, this.listen.once[ event ].length );
        list.push( ...this.listen.once[ "*" ].splice( 0, this.listen.once[ "*" ].length ));
        return this._syncCallbacks( check, list );
    }

    onceNotifySync( event:E|string,  ...data){
        return this.onceNotifySyncWith( event, null, ...data );
    }

    private _syncCallbacks( check:E|string, callbacks:ListenerEvent[], ...data ){

        return new Promise( resolve => {
            let next = ( )=>{
                if( !callbacks.length )  resolve( true )
                let _next = callbacks.pop();
                if( _next.regexp && check && !_next.regexp.test( check ) ) return next();
                let response = _next.callback( ...data );

                if(!(response instanceof Promise ) ) next();
                else ( response.then( value =>  next() ).catch( reason => {
                    console.log( "ListerCatchError", reason );
                }));
            }
            next();
        });
    }
}