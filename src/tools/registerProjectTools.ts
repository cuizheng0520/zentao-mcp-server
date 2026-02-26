import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaskStatus } from "../types/zentao.js";
import type { ToolContext } from "./toolContext.js";

export function registerProjectTools(server: McpServer, context: ToolContext): void {
    const taskStatusSchema = z.enum(['wait', 'doing', 'done', 'pause', 'cancel', 'closed', 'all']).optional();

    server.tool("getProducts", {}, async () => {
        const products = await context.getApi().getProducts();
        return {
            content: [{ type: "text", text: JSON.stringify(products, null, 2) }]
        };
    });

    server.tool("getProjects",
        {
            refresh: z.boolean().optional()
        },
        async ({ refresh }) => {
            const projects = await context.getApi().getProjects({ refresh });
            return {
                content: [{ type: "text", text: JSON.stringify(projects, null, 2) }]
            };
        }
    );

    server.tool("getExecutions",
        {
            projectId: z.number().int().positive().optional()
        },
        async ({ projectId }) => {
            const executions = await context.getApi().getExecutions({ projectId });
            return {
                content: [{ type: "text", text: JSON.stringify(executions, null, 2) }]
            };
        }
    );

    server.tool("getProjectTaskCount",
        {
            projectId: z.number().int().positive(),
            status: taskStatusSchema
        },
        async ({ projectId, status }) => {
            const taskCount = await context.getApi().getProjectTaskCount(projectId, status as TaskStatus | undefined);
            return {
                content: [{ type: "text", text: JSON.stringify({ projectId, status: status || 'all', taskCount }, null, 2) }]
            };
        }
    );
}
