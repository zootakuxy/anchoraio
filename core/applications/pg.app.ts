import {Application} from "./Application";

class PgApp extends Application {
    constructor() {
        super( module );
    }
}
export function createInstance(){
    return new PgApp()
}