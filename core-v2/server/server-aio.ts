import {BaseEventEmitter} from "kitres/src/core/util";

interface ServerAioEvent{
}


export class ServerAio extends BaseEventEmitter<ServerAioEvent> {
    constructor() {
        super();
    }
}