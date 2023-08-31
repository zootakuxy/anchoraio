import {AgentContext} from "../agent-context";
import {DirWatch} from "../../utils/dir-watch";

export class Configs {
    context:AgentContext;
    dirWatch:DirWatch;

    constructor(context: AgentContext) {
        this.context = context;
        this.dirWatch = new DirWatch();
    }
}