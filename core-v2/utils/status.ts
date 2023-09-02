export type StatusLevel = "started"|"stopped"|"starting"|"stopping";
export class Status {
    private _status:StatusLevel;

    constructor() {
        this._status = "stopped";
    }

    start( callback:()=>any ){
        return new Promise( resolve => {
            if( this._status !== "stopped" ) return resolve( false );
            this._status = "starting";
            let end = ( stt:StatusLevel )=>{
                this._status = stt;
                return resolve( this._status === "started" );
            }
            let _result = callback();
            if( _result instanceof Promise ) {
                _result.then( value => {
                    return end( "started" );
                }).catch( reason => {
                    return end( "stopped" );
                })
            } else return end( "started" );
        })
    }

    stop( callback:()=>any ){
        return new Promise( resolve => {
            if( this._status !== "started" ) return resolve( false );
            this._status = "stopping";
            let end = ( stt:StatusLevel )=>{
                this._status = stt;
                return resolve( this._status === "stopped" );
            }
            let _result = callback();
            if( _result instanceof Promise ) {
                _result.then( value => {
                    return end( "stopped" );
                }).catch( reason => {
                    return end( "started" );
                })
            } else return end( "stopped" );
        })
    }

    get status(): StatusLevel {
        return this._status;
    }
}