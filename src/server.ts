import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZentaoAPI } from "./api/zentaoApi.js";
import { registerBugTools } from "./tools/registerBugTools.js";
import { registerInitTools } from "./tools/registerInitTools.js";
import { registerProjectTools } from "./tools/registerProjectTools.js";
import { registerTaskTools } from "./tools/registerTaskTools.js";
import { ToolContext } from "./tools/toolContext.js";

export function createZentaoServer(): McpServer {
    const server = new McpServer({
        name: "Zentao API",
        version: "1.0.0"
    });

    let zentaoApi: ZentaoAPI | null = null;

    function getInitializedApi(): ZentaoAPI {
        if (!zentaoApi) {
            throw new Error("Please initialize Zentao API first");
        }
        return zentaoApi;
    }

    const context: ToolContext = { getApi: getInitializedApi };

    registerInitTools(server, (api) => {
        zentaoApi = api;
    });
    registerTaskTools(server, context);
    registerProjectTools(server, context);
    registerBugTools(server, context);

    return server;
}

export async function startZentaoServer(): Promise<void> {
    const server = createZentaoServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
