import {TokenOptions} from "../../../aio/opts/opts-token";
import fs from "fs";
import chalk from "chalk";
import Path from "path";
import ini from "ini";
import {nanoid} from "nanoid";
import {iniutil} from "kitres";

export interface Token {
    identifier:string,
    token:string,
    date:string,
    status:"active"|"disable",
    mail:string
    machine?:string
}

export class TokenService {
    private readonly _opts:TokenOptions;
    private _folder:string;

    constructor( options:TokenOptions ) {
        this._opts = options;
    }

    get opts(): TokenOptions {
        return this._opts;
    }

    start():number{
        if( this.opts.list ) return this.listAll();
        if( this.opts.identifier && this.opts.generate ) return  this.generateToken();
        if( this.opts.identifier && this.opts.update ) return  this.updateToken();
        if( this.opts.identifier ) return this.showToken();
    }

    public get  folder(){
        if( !this._folder ){
            fs.mkdirSync( Path.join( this.opts.etc, "token" ), { recursive: true} );
            this._folder =  Path.join( this.opts.etc, "token" );
        }
        return this._folder;
    }

    public get extension(){
        let _extension = "aio.conf"
       // return new RegExp( `((^)*.${_extension})|((^)${_extension})$`)
       return new RegExp( `((^)*.${_extension})$`)
    }

    public listAll():number{
        let _extension = this.extension;
        let list: ({ identifier, date, filename, cfg, status:"active"|"disable", mail:string})[] = [];
        fs.readdirSync( this. folder ).filter( value => {
            return _extension.test( value )
        } ).forEach(configName => {
            let _token = this.tokenOf( configName );
            if( !_token.token ) return;
            list.push({
                identifier: _token.token.identifier,
                date: _token.token.date,
                filename: _token.filename,
                cfg: _token.confName,
                mail: _token.token.mail,
                status: _token.token.status
            });
        });
        if( this.opts.format === "table" ){
            console.info( "=========================== LIST OF TOKEN ===========================");
            console.table( list );
        } else if( this.opts.format === "json" ) {
            console.info( JSON.stringify( list ))
        } else if( this.opts.format === "file" ) {
            list.forEach( value => console.info( value.filename ) ) ;
        } else if( this.opts.format === "cfg" ){
            list.forEach( value => console.info( value.cfg ) )
        } else if( this.opts.format === "label" ){
            list.forEach( (token, index) => {
                if( index > 0 ) console.info( "===============================================================")
                console.info( "IDENTIFIER:", token.identifier );
                console.info( "MAIL      :", token.mail );
                console.info( "DATE      :", token.date );
                console.info( "FILE      :", token.filename );
                console.info( "CFG       :", token.cfg );
                console.info( "STATUS    :", token.status );
            })
        } else if( this.opts.format === "ini" ){
            console.info( ini.stringify( list ) )
        }
        return 0;
    }



    public rawOf(confName:string):string{
        if( !confName ) return null;
        let confFile = Path.join( this.folder, confName );

        if( !fs.existsSync( confFile ) ) return null;
        return fs.readFileSync(Path.join(this.folder, confName), "utf8").toString();
    }

    public get token():Token{
        let { token } = this.tokenOf( this.opts.identifier );
        return token;
    }

    public tokenOf( name:string ):{raw?:string, token?:Token, json?:string, filename?:string, confName?:string }{
        let { confName, filename} =  this.confNameOf( name );
        let raw = this.rawOf( confName );
        let rejected = ( message:string, ...opst:any[] )=>{
            console.log( message, ...opst );
            return {};
        }

        if( !raw ) return rejected( `!raw` );
        let token = ini.parse( raw ) as Token;
        if( !token.token ) return rejected( `!token.token`, { confName, filename, raw } );
        if( !token.date ) return rejected( `!token.date` );
        if( !token.identifier ) return rejected( `!token.identifier` );
        if( ![ "active", "disable" ].includes( token.status ) ) return rejected( `![ "active", "disable" ].includes( token.status )` )
        let json = JSON.stringify( token );
        return { raw, token, json, filename, confName  };
    }

    public link( name:string, machine:string ){
        let token = this.tokenOf( name );
        if( !token ) return null;
        if( !token.token ) return null;
        token.token.machine = machine;
        fs.writeFileSync( token.filename, iniutil.stringify( token.token ) );
        return this.tokenOf( name );
    }

    public confNameOf( identifier?:string ):{ confName?:string, filename?:string }{
        if( !identifier ) identifier = this.opts.identifier;
        if( !identifier ) return null;
        let _parts = identifier.split( "." );
        if(  _parts.length === 3 && _parts[0].length >0  && _parts[1] === "aio" && _parts[2] === "conf" ) return {
            confName: identifier,
            filename: Path.join( this.folder, identifier )
        };
        if( _parts.length !== 2 ) return {};
        identifier = `${identifier}.conf`
        return {
            confName: identifier,
            filename: Path.join( this.folder, identifier )
        };
    }

    private showToken():number {
        let { token, raw, filename, json, confName } = this.tokenOf( this.opts.identifier )

        if( !token ){
            console.error( chalk.redBright( `Token for identifier ${ this.opts.identifier } not found or invalid!` ) );
            return -1;
        }

        let _self = this;
        let formats = (({  table(){
                console.info( `=========================== TOKEN OF ${_self.opts.identifier} ===========================`);
                console.table( [token] )
                ;}, ini(){
                console.info( raw );
            }, label(){
                console.info( "IDENTIFIER:", token.identifier );
                console.info( "DATE      :", token.date );
                console.info( "TOKEN     :", token.token );
            }, file(){
                console.info( filename );
            }, cfg(){
                console.info( confName )
            }, json(){
                console.info( json )
            }
        }) as {[p in typeof _self.opts.format ]?:()=>void });
        if( !Object.keys( formats ).includes( _self.opts.format ) ){
            console.error( chalk.redBright( `Invalid format ${ this.opts.format }` ));
            return -1;
        }
        formats[ _self.opts.format ]();
        return 0;
    }

    private updateToken():number{
        let {confName} = this.confNameOf();
        if( !confName ){
            console.error( chalk.redBright( 'Missing identifier for generate token!') ) ;
            return -1
        }
        let currentToken = this.tokenOf( confName );
        if( !currentToken?.token  ){
            console.error( chalk.redBright( `Token for identifier ${ this.opts.identifier } not found or invalid`) ) ;
            return -1;
        }
        this.writeToken( currentToken.token.token, confName );
    }

    private generateToken():number {
        let {confName} = this.confNameOf();
        if( !confName ){
            console.error( chalk.redBright( 'Missing identifier for generate token!') );
            return -1;
        }

        let currentToken = this.tokenOf( confName );
        if( currentToken?.token && !this.opts.update ){
            console.error( chalk.redBright( `Already exists token to ${ confName }. use [--update] to force generate`) ) ;
            return -1;
        }
        let check = Math.trunc( (Math.random()*(9999-1000))+1000 );
        let token = `${new Date().getTime()}:${nanoid( 128 )}|${check}`;
        return this.writeToken( token, confName );
    }

    private writeToken( _token:string, confName:string ){
        let token:Token = {
            identifier: this.opts.identifier,
            date: new Date().toISOString(),
            token: _token,
            status: this.opts.status,
            mail: this.opts.mail
        };
        let tokenData = ini.stringify( token );
        fs.writeFileSync( Path.join( this.folder, confName), tokenData );
        let t = this.opts.format;
        this.opts.format = "ini";
        let response =  this.showToken();
        this.opts.format = t;
        return response;
    }
}