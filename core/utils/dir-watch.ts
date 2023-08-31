import {Listener} from "./listener";
import fs from "fs";
import watch from "recursive-watch";
import Path from "path";

export type WatchEvent = "delete"|"create"|"change"|"write"|"reader"|"base-reader";

export interface Detect {
    filename:string,
    dirname:string,
    basename:string,
    event:WatchEvent
}

export interface Acceptor{
    base:string,
    acceptors:RegExp[];
}

export class DirWatch {
    exists:string[];
    listener:Listener<WatchEvent>;
    acceptors:Acceptor[] = [];

    constructor() {
        this.exists = [];
        this.listener = new Listener();
        this.acceptors=[];
    }

    acceptor( base:string, ...acceptors:RegExp[] ){
        let index = this.acceptors.findIndex( value => value.base === base );
        if( index === -1 ) this.acceptors.push({ base, acceptors: acceptors } );
        else this.acceptors[ index ] = { base, acceptors };
    }

    accept( base:string, fileName:string):boolean{
        return !!this.acceptors.find( value => value.base === base
            && value.acceptors.find( value1 => value1.test( fileName ))
        );
    }

    public start( ){
        this.exists.splice( 0, this.exists.length );
        this.acceptors.forEach( value => {
            let list = this.rescan( value.base, value.base );
            this.exists.push( ...list );
            this.listener.notify( "base-reader", list );
        });

        this.listener.notify( "reader", this.exists );


        this.acceptors.forEach( value => {
            this.watch( value.base );
        });
    }

    private rescan(  base:string, dirname:string ):string[]{
        let _files = [];
        fs.readdirSync( dirname ).forEach( basename => {
            let filename = Path.join( dirname, basename );
            let relative = Path.relative( base, filename );
            let state = fs.statSync( filename );

            if( state.isDirectory() ){
                return _files.push( ...this.rescan( base, filename ));
            }
            if( !state.isFile() ) return;
            if( !this.accept( base, relative ) ) return;
            _files.push( filename );
        })
        return _files;
    }

    private watch( base:string){
        watch( base, ( filename ) => {
            let action:WatchEvent;

            if( !this.accept( base, filename ) ) return;
            if( fs.existsSync( filename ) && !fs.statSync( filename ).isFile() ) return;

            if( !fs.existsSync( filename ) ) action = "delete";
            else if( fs.existsSync( filename ) && !this.exists.includes( filename ) ) action = "create";
            else if( fs.existsSync( filename ) && this.exists.includes( filename ) ) action = "change";


            if( action === "delete" ){
                let index = this.exists.indexOf( filename );
                if( index !== -1 ) this.exists = this.exists.splice( index, 1 );
            }
            else if( action === "create" ) this.exists.push( filename );

            let basename = Path.basename( filename );
            let relative = Path.relative( base, filename );
            let dirname = Path.dirname( filename );

            this.listener.notifyWith( action, relative,  filename, ({ filename, basename, dirname, event: action } as Detect) );
            if( action === "create" || action === "change" )
                this.listener.notifyWith( "write", relative,  filename, ({ filename, basename, dirname, event: action } as Detect) );
        });
    }

}



