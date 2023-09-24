import {TokenOptions} from "../../aio/opts/opts-token";
import {ServerAio} from "./server-aio";
import {AuthService} from "./services/auth.service";
import {ResponseService} from "./services/response.service";
import {RequesterService} from "./services/requester.service";
export type ServerOptions = TokenOptions & {
    responsePort:number,
    requestPort:number
    authPort:number
}

export function server( opts:ServerOptions){
    let saio = new ServerAio( opts );
    let serverAuth = new AuthService( saio );
    let responseGetawayApplication =  new ResponseService( saio );
    let requestGetawaySever = new RequesterService( saio );

    [{serverAuth}, {serverDestine: responseGetawayApplication}, {clientOrigin: requestGetawaySever} ].forEach( (entry) => {
        Object.entries( entry ).forEach( ([key, server]) => {
            server.on("error", err => {
               console.log( key, "error", err.message );
           });
        });
    });

    serverAuth.listen( opts.authPort );
    responseGetawayApplication.listen( opts.responsePort );
    requestGetawaySever.listen( opts.requestPort );
}