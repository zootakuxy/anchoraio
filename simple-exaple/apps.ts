import * as fs from "fs";
import {configs} from "./configs";
import * as path from "path";
import ini from "ini";

let exists = fs.existsSync( path.join( configs.etc, "apps.conf" ));
export const apps:{ apps:{ [p:string]:string|number|{
    port:number|string
    address?:string
}}} = exists ? ini.parse( fs.readFileSync( path.join( configs.etc, "apps.conf" )).toString("utf8") ) as any: { apps: {} };