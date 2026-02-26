import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BugResolution, BugStatus } from "../types/zentao.js";
import type { ToolContext } from "./toolContext.js";

export function registerBugTools(server: McpServer, context: ToolContext): void {
    server.tool("getMyBugs",
        {
            status: z.enum(['active', 'resolved', 'closed', 'all']).optional(),
            productId: z.number().optional()
        },
        async ({ status, productId }) => {
            const bugs = await context.getApi().getMyBugs(status as BugStatus, productId);
            return {
                content: [{ type: "text", text: JSON.stringify(bugs, null, 2) }]
            };
        }
    );

    server.tool("getBugDetail",
        { bugId: z.number() },
        async ({ bugId }) => {
            const bug = await context.getApi().getBugDetail(bugId);
            return {
                content: [{ type: "text", text: JSON.stringify(bug, null, 2) }]
            };
        }
    );

    server.tool("resolveBug",
        {
            bugId: z.number(),
            resolution: z.object({
                resolution: z.enum(['fixed', 'notrepro', 'duplicate', 'bydesign', 'willnotfix', 'tostory', 'external']),
                resolvedBuild: z.string().optional(),
                duplicateBug: z.number().optional(),
                comment: z.string().optional()
            })
        },
        async ({ bugId, resolution }) => {
            const bug = await context.getApi().resolveBug(bugId, resolution as BugResolution);
            return {
                content: [{ type: "text", text: JSON.stringify(bug, null, 2) }]
            };
        }
    );
}
