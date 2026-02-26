import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZentaoAPI } from "../api/zentaoApi.js";
import { loadConfig } from "../config.js";

export function registerInitTools(server: McpServer, setApi: (api: ZentaoAPI) => void): void {
    server.tool("initZentao", {}, async () => {
        const config = loadConfig();
        if (!config) {
            throw new Error("No configuration found. Please provide complete Zentao configuration.");
        }

        const api = new ZentaoAPI(config);
        setApi(api);

        const safeConfig = {
            url: config.url,
            username: config.username,
            apiVersion: config.apiVersion
        };

        return {
            content: [{ type: "text", text: JSON.stringify(safeConfig, null, 2) }]
        };
    });
}
