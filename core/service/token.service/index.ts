import {TokenOption} from "./opts";
import fs from "fs";
import chalk from "chalk";
import Path from "path";
import ini from "ini";
import {nanoid} from "nanoid";

export interface Token {
    identifier:string,
    token:string,
    date:string,
    status:"active"|"disable"
}

export class TokenService {
    private readonly _opts:TokenOption;
    private _folder:string;

    constructor( options:TokenOption ) {
        this._opts = options;
    }


    get opts(): TokenOption {
        return this._opts;
    }

    start(){
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

    public listAll() {
        let _extension = this.extension;
        let list: ({ identifier, date, filename, cfg, status:"active"|"disable"})[] = [];
        console.log( "Token folder", this.folder );
        fs.readdirSync( this. folder ).filter( value => _extension.test( value ) ).forEach(configName => {
            console.log( configName );
            let _token = this.tokenOf( configName );
            if( !_token.token ) return;
            list.push({
                identifier: _token.token.identifier,
                date: _token.token.date,
                filename: _token.filename,
                cfg: _token.confName,
                status: _token.token.status
            });
        });
        console.log( "=========================== LIST OF TOKEN ===========================");
        console.table(
            list
        );
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
        if( !raw ) return {};
        let token = ini.parse( raw ) as Token;
        if( !token.token ) return {};
        if( !token.date ) return {};
        if( !token.identifier ) return {};
        if( ![ "active", "disable" ].includes( token.status ) ) return {}
        let json = JSON.stringify( token );
        return { raw, token, json, filename, confName  };
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

    private showToken() {
        let { token, raw, filename, json, confName } = this.tokenOf( this.opts.identifier )

        if( !token ){
            console.log( chalk.redBright( `Token for identifier ${ this.opts.identifier } not found or invalid!` ) );
            return;
        }

        let _self = this;
        (({  table(){
                console.log( `=========================== TOKEN OF ${_self.opts.identifier} ===========================`);
                console.table( [token] )
                ;}, ini(){
                console.log( raw );
            }, label(){
                console.log( "IDENTIFIER:", token.identifier );
                console.log( "DATE      :", token.date );
                console.log( "TOKEN     :", token.token );
            }, file(){
                console.log(filename);
            }, cfg(){
                console.log( confName )
            }, json(){
                console.log( json )
            }
        }) as {[p in typeof _self.opts.format ]?:()=>void }) [ _self.opts.format ]();

    }

    private updateToken(){
        console.log( "UODATE TOKEN")
        let {confName} = this.confNameOf();
        if( !confName ){
            return console.log( chalk.redBright( 'Missing identifier for generate token!') ) ;
        }
        let currentToken = this.tokenOf( confName );
        if( !currentToken?.token  ){
            return console.log( chalk.redBright( `Token for identifier ${ this.opts.identifier } not found or invalid`) ) ;
        }
        this.writeToken( currentToken.token.token, confName );
    }

    private generateToken() {
        let {confName} = this.confNameOf();
        if( !confName ){
            return console.log( chalk.redBright( 'Missing identifier for generate token!') ) ;
        }

        let currentToken = this.tokenOf( confName );
        if( currentToken?.token && !this.opts.update ){
            return console.log( chalk.redBright( `Already exists token to ${ confName }. use [--update] to force generate`) ) ;
        }
        let check = Math.trunc( (Math.random()*(9999-1000))+1000 );
        let token = `${new Date().getTime()}:${nanoid( 128 )}|${check}`;
        this.writeToken( token, confName );
    }

    private writeToken( _token:string, confName:string ){
        let token:Token = {
            identifier: this.opts.identifier,
            date: new Date().toISOString(),
            token: _token,
            status: this.opts.status
        };
        let tokenData = ini.stringify( token );
        fs.writeFileSync( Path.join( this.folder, confName), tokenData );
        this.showToken();
    }
}