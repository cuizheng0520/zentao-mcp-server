import type { ZentaoAPI } from "../api/zentaoApi.js";

export interface ToolContext {
    getApi: () => ZentaoAPI;
}
