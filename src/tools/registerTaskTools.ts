import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CreateTaskRequest, TaskStatus, TaskUpdate } from "../types/zentao.js";
import type { ToolContext } from "./toolContext.js";

export function registerTaskTools(server: McpServer, context: ToolContext): void {
    const taskStatusSchema = z.enum(['wait', 'doing', 'done', 'pause', 'cancel', 'closed', 'all']).optional();

    server.tool("getMyTasks",
        {
            status: taskStatusSchema,
            includeAll: z.boolean().optional(),
            executionId: z.number().int().positive().optional(),
            projectId: z.number().int().positive().optional(),
            limit: z.number().int().positive().optional()
        },
        async ({ status, includeAll, executionId, projectId, limit }) => {
            const tasks = await context.getApi().getMyTasks(status as TaskStatus, includeAll, {
                executionId,
                projectId,
                limit
            });
            return {
                content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }]
            };
        }
    );

    server.tool("getTaskDetail",
        { taskId: z.number() },
        async ({ taskId }) => {
            const task = await context.getApi().getTaskDetail(taskId);
            return {
                content: [{ type: "text", text: JSON.stringify(task, null, 2) }]
            };
        }
    );

    server.tool("updateTask",
        {
            taskId: z.number(),
            update: z.object({
                consumed: z.number().optional(),
                left: z.number().optional(),
                status: taskStatusSchema,
                finishedDate: z.string().optional(),
                comment: z.string().optional()
            })
        },
        async ({ taskId, update }) => {
            const task = await context.getApi().updateTask(taskId, update as TaskUpdate);
            return {
                content: [{ type: "text", text: JSON.stringify(task, null, 2) }]
            };
        }
    );

    server.tool("createTask",
        {
            task: z.object({
                name: z.string().min(1),
                desc: z.string().optional(),
                pri: z.number().int().min(1).max(4).optional(),
                estimate: z.number().optional(),
                project: z.number().int().positive().optional(),
                execution: z.number().int().positive(),
                module: z.number().int().optional(),
                story: z.number().int().optional(),
                type: z.string().optional(),
                assignedTo: z.string().optional(),
                estStarted: z.string().optional(),
                deadline: z.string().optional()
            })
        },
        async ({ task }) => {
            const created = await context.getApi().createTask(task as CreateTaskRequest);
            return {
                content: [{ type: "text", text: JSON.stringify(created, null, 2) }]
            };
        }
    );

    server.tool("finishTask",
        {
            taskId: z.number(),
            update: z.object({
                consumed: z.number().optional(),
                left: z.number().optional(),
                comment: z.string().optional()
            }).optional()
        },
        async ({ taskId, update }) => {
            const task = await context.getApi().finishTask(taskId, update as TaskUpdate);
            return {
                content: [{ type: "text", text: JSON.stringify(task, null, 2) }]
            };
        }
    );
}
