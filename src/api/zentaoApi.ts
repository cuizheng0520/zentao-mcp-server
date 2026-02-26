import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Bug, BugResolution, BugStatus, CreateTaskRequest, Execution, Product, Project, Task, TaskStatus, TaskUpdate, ZentaoConfig } from '../types/zentao';

export class ZentaoAPI {
    private config: ZentaoConfig;
    private client: AxiosInstance;
    private token: string | null = null;
    private projectCache: { expiresAt: number; projects: Project[] } | null = null;
    private readonly debugEnabled: boolean;

    constructor(config: ZentaoConfig) {
        this.config = config;
        this.debugEnabled = process.env.ZENTAO_DEBUG === '1';
        this.client = axios.create({
            baseURL: `${this.config.url}/api.php/${this.config.apiVersion}`,
            timeout: 10000,
        });
    }

    private logDebug(message: string, payload?: unknown): void {
        if (!this.debugEnabled) return;
        if (payload !== undefined) {
            console.error(message, payload);
            return;
        }
        console.error(message);
    }

    private async getToken(): Promise<string> {
        if (this.token) return this.token;

        const password = createHash('md5')
            .update(this.config.password)
            .digest('hex');

        try {
            this.logDebug('正在请求token...');

            const response = await this.client.post('/tokens', {
                account: this.config.username,
                password,
            });

            if (response.status === 200 || response.status === 201) {
                if (typeof response.data === 'object' && response.data.token) {
                    this.token = response.data.token;
                    return this.token as string;
                }
                throw new Error(`获取token失败: 响应格式不正确 ${JSON.stringify(response.data)}`);
            }

            throw new Error(`获取token失败: 状态码 ${response.status}`);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const errorMessage = error.response
                    ? `状态码: ${error.response.status}, 响应: ${JSON.stringify(error.response.data)}`
                    : error.message;
                throw new Error(`登录失败: ${errorMessage}`);
            }
            throw error;
        }
    }

    private async request<T>(method: string, url: string, params?: any, data?: any): Promise<T> {
        const token = await this.getToken();
        try {
            this.logDebug(`正在请求 ${method} ${url}`, {
                hasParams: Boolean(params),
                hasData: Boolean(data),
            });
            const response = await this.client.request({
                method,
                url,
                params,
                data,
                headers: { Token: token },
            });

            this.logDebug(`响应状态码: ${response.status}`);

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('请求失败:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                });
                throw new Error(`请求失败: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }

    async getMyTasks(
        status?: TaskStatus,
        includeAll?: boolean,
        options?: { executionId?: number; projectId?: number; limit?: number }
    ): Promise<Task[]> {
        const taskStatus = status || 'all';

        // Zentao's /tasks endpoint in some deployments only returns "my tasks".
        // To fetch team-wide tasks, aggregate from each execution.
        if (includeAll) {
            const executionsResp = await this.request<{ executions?: Array<{ id: number }> }>('GET', '/executions');
            let executions = executionsResp.executions || [];
            const executionId = options?.executionId;
            const projectId = options?.projectId;
            const limit = options?.limit && options.limit > 0 ? options.limit : undefined;

            if (executionId) {
                executions = executions.filter((e: any) => Number(e.id) === executionId);
            } else if (projectId) {
                executions = executions.filter((e: any) =>
                    Number(e.id) === projectId || Number(e.project) === projectId
                );
            }

            const allTasks: Task[] = [];
            const seen = new Set<number>();

            for (const execution of executions) {
                let page = 1;
                for (;;) {
                    const resp = await this.request<{ total?: number; limit?: number; tasks?: Task[] }>(
                        'GET',
                        `/executions/${execution.id}/tasks`,
                        { status: taskStatus, page }
                    );

                    const tasks = resp.tasks || [];
                    for (const task of tasks) {
                        if (task?.id && seen.has(task.id)) continue;
                        if (task?.id) seen.add(task.id);
                        allTasks.push(task);
                        if (limit && allTasks.length >= limit) return allTasks.slice(0, limit);
                    }

                    const pageSize = Number(resp.limit) || 100;
                    const total = Number(resp.total) || tasks.length;
                    if (tasks.length === 0 || page * pageSize >= total) break;
                    page += 1;
                }
            }

            // Some Zentao deployments hide sub-tasks from execution task list.
            // Try to discover child task ids from task details and fetch missing ones directly.
            const detailCache = new Map<number, Task>();
            const queue = allTasks
                .map((task: any) => Number(task?.id))
                .filter((id) => Number.isInteger(id) && id > 0);
            const processed = new Set<number>();
            while (queue.length > 0) {
                const taskId = queue.shift() as number;
                if (processed.has(taskId)) continue;
                processed.add(taskId);

                let detail = detailCache.get(taskId);
                if (!detail) {
                    try {
                        detail = await this.getTaskDetail(taskId);
                        detailCache.set(taskId, detail);
                    } catch {
                        continue;
                    }
                }

                const childIds = this.extractChildTaskIds(detail as any);
                for (const childId of childIds) {
                    if (seen.has(childId)) continue;
                    try {
                        const childTask = await this.getTaskDetail(childId);
                        seen.add(childId);
                        allTasks.push(childTask);
                        detailCache.set(childId, childTask);
                        queue.push(childId);
                        if (limit && allTasks.length >= limit) return allTasks.slice(0, limit);
                    } catch {
                        // ignore inaccessible or deleted tasks
                    }
                }
            }

            return allTasks;
        }

        const response = await this.request<{ tasks: Task[] }>('GET', '/tasks', {
            assignedTo: this.config.username,
            status: taskStatus,
        });
        return response.tasks;
    }

    private extractChildTaskIds(task: any): number[] {
        if (!task || typeof task !== 'object') return [];

        const ids = new Set<number>();

        const pushId = (value: any) => {
            const num = Number(value);
            if (Number.isInteger(num) && num > 0) ids.add(num);
        };

        const walk = (value: any) => {
            if (!value) return;

            if (Array.isArray(value)) {
                for (const item of value) walk(item);
                return;
            }

            if (typeof value === 'object') {
                if ('id' in value) pushId(value.id);
                for (const key of Object.keys(value)) {
                    walk(value[key]);
                }
                return;
            }

            if (typeof value === 'string' || typeof value === 'number') {
                pushId(value);
            }
        };

        const directKeys = [
            'children',
            'childTasks',
            'subTasks',
            'subtasks',
            'tasks',
            'sons'
        ];

        for (const key of directKeys) {
            if (key in task) walk(task[key]);
        }

        return Array.from(ids);
    }

    async getTaskDetail(taskId: number): Promise<Task> {
        this.logDebug(`正在获取任务 ${taskId} 的详情`);
        const response = await this.request<{ task: Task }>('GET', `/tasks/${taskId}`);
        this.logDebug('任务详情请求完成');

        if (!response) {
            throw new Error(`获取任务详情失败: 响应为空`);
        }

        // 检查响应格式
        if (response && typeof response === 'object') {
            if ('task' in response) {
                return response.task;
            } else {
                // 如果响应本身就是任务对象
                return response as unknown as Task;
            }
        }

        throw new Error(`获取任务详情失败: 响应格式不正确 ${JSON.stringify(response)}`);
    }

    async getProducts(): Promise<Product[]> {
        try {
            this.logDebug('正在获取产品列表...');
            const response = await this.request<{ products?: Product[] }>('GET', '/products');
            this.logDebug('产品列表请求完成');

            if (Array.isArray(response)) {
                return response;
            } else if (response && typeof response === 'object') {
                if (Array.isArray(response.products)) {
                    return response.products;
                }
            }

            throw new Error(`获取产品列表失败: 响应格式不正确 ${JSON.stringify(response)}`);
        } catch (error) {
            console.error('获取产品列表失败:', error);
            throw error;
        }
    }

    async getProjects(options?: { refresh?: boolean; ttlMs?: number }): Promise<Project[]> {
        const refresh = Boolean(options?.refresh);
        const ttlMs = options?.ttlMs && options.ttlMs > 0 ? options.ttlMs : 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (!refresh && this.projectCache && this.projectCache.expiresAt > now) {
            this.logDebug('使用内存缓存的项目列表');
            return this.projectCache.projects;
        }

        if (!refresh) {
            const fileCached = await this.readProjectsCache(ttlMs);
            if (fileCached) {
                this.logDebug('使用文件缓存的项目列表');
                this.projectCache = { projects: fileCached, expiresAt: now + ttlMs };
                return fileCached;
            }
        }

        const response = await this.request<{ projects?: Project[] }>('GET', '/projects');
        let projects: Project[];
        if (Array.isArray(response)) {
            projects = response as unknown as Project[];
        } else if (response && typeof response === 'object' && Array.isArray(response.projects)) {
            projects = response.projects;
        } else {
            throw new Error(`获取项目列表失败: 响应格式不正确 ${JSON.stringify(response)}`);
        }

        this.projectCache = { projects, expiresAt: now + ttlMs };
        await this.writeProjectsCache(projects);
        return projects;
    }

    private getProjectsCacheFilePath(): string {
        const cacheDir = process.env.ZENTAO_CACHE_DIR?.trim();
        if (cacheDir) {
            return path.join(cacheDir, 'projects.json');
        }
        return path.join(os.homedir(), '.zentao', 'cache', 'projects.json');
    }

    private async readProjectsCache(ttlMs: number): Promise<Project[] | null> {
        try {
            const cacheFile = this.getProjectsCacheFilePath();
            const raw = await fs.readFile(cacheFile, 'utf-8');
            const parsed = JSON.parse(raw) as { updatedAt?: number; projects?: Project[] };

            if (!parsed || !Array.isArray(parsed.projects) || typeof parsed.updatedAt !== 'number') {
                return null;
            }
            if (Date.now() - parsed.updatedAt > ttlMs) {
                return null;
            }
            return parsed.projects;
        } catch {
            return null;
        }
    }

    private async writeProjectsCache(projects: Project[]): Promise<void> {
        try {
            const cacheFile = this.getProjectsCacheFilePath();
            await fs.mkdir(path.dirname(cacheFile), { recursive: true });
            await fs.writeFile(cacheFile, JSON.stringify({ updatedAt: Date.now(), projects }, null, 2), 'utf-8');
        } catch (error) {
            console.error('写入项目缓存失败:', error);
        }
    }

    async getProjectTaskCount(projectId: number, status?: TaskStatus): Promise<number> {
        const taskStatus = status || 'all';
        const executionsResp = await this.request<{ executions?: Array<{ id: number; project?: number }> }>(
            'GET',
            '/executions'
        );
        const executions = Array.isArray(executionsResp.executions) ? executionsResp.executions : [];
        const projectExecutions = executions.filter(
            (execution) => Number(execution.id) === projectId || Number(execution.project) === projectId
        );

        if (projectExecutions.length === 0) {
            return 0;
        }

        let totalCount = 0;
        for (const execution of projectExecutions) {
            const resp = await this.request<{ total?: number; tasks?: Task[] }>(
                'GET',
                `/executions/${execution.id}/tasks`,
                { status: taskStatus, page: 1 }
            );
            const total = Number(resp.total);
            totalCount += Number.isFinite(total) && total >= 0 ? total : Array.isArray(resp.tasks) ? resp.tasks.length : 0;
        }

        return totalCount;
    }

    async getExecutions(options?: { projectId?: number }): Promise<Execution[]> {
        const response = await this.request<{ executions?: Execution[] }>('GET', '/executions');
        const executions = Array.isArray(response?.executions) ? response.executions : [];
        if (!options?.projectId) return executions;

        return executions.filter((execution) =>
            Number(execution.id) === options.projectId || Number(execution.project) === options.projectId
        );
    }

    async getMyBugs(status?: BugStatus, productId?: number): Promise<Bug[]> {
        if (!productId) {
            // 如果没有提供产品ID，获取第一个可用的产品
            const products = await this.getProducts();
            if (products.length === 0) {
                throw new Error('没有可用的产品');
            }
            productId = products[0].id;
            this.logDebug(`使用第一个可用的产品ID: ${productId}`);
        }

        const params = {
            assignedTo: this.config.username,
            status: status || 'all',
            product: productId
        };

        try {
            this.logDebug('正在获取Bug列表');
            const response = await this.request<{ bugs: Bug[] }>('GET', '/bugs', params);
            this.logDebug('Bug列表请求完成');

            if (Array.isArray(response)) {
                return response;
            } else if (response && typeof response === 'object' && Array.isArray(response.bugs)) {
                return response.bugs;
            }

            throw new Error(`获取Bug列表失败: 响应格式不正确 ${JSON.stringify(response)}`);
        } catch (error) {
            if (error instanceof Error && error.message.includes('Need product id')) {
                throw new Error('获取Bug列表失败: 请提供产品ID');
            }
            console.error('获取Bug列表失败:', error);
            throw error;
        }
    }

    async getBugDetail(bugId: number): Promise<Bug> {
        const response = await this.request<any>('GET', `/bugs/${bugId}`);

        // Some Zentao deployments return { bug: {...} }, others return the bug object directly.
        if (response && typeof response === 'object') {
            if (response.bug && typeof response.bug === 'object') return response.bug as Bug;
            if (typeof response.id === 'number') return response as Bug;
        }

        throw new Error(`获取Bug详情失败: 响应格式不正确 ${JSON.stringify(response)}`);
    }

    async updateTask(taskId: number, update: TaskUpdate): Promise<Task> {
        try {
            this.logDebug(`正在更新任务 ${taskId}...`);
            const response = await this.request<Task>('PUT', `/tasks/${taskId}`, undefined, {
                ...update,
                assignedTo: this.config.username,
            });
            this.logDebug('任务更新请求完成');
            return response;
        } catch (error) {
            console.error('更新任务失败:', error);
            throw error;
        }
    }

    async finishTask(taskId: number, update: TaskUpdate = {}): Promise<Task> {
        try {
            this.logDebug(`正在完成任务 ${taskId}...`);
            const finalUpdate: TaskUpdate = {
                status: 'done',
                finishedDate: new Date().toISOString(),
                ...update,
            };
            return await this.updateTask(taskId, finalUpdate);
        } catch (error) {
            console.error('完成任务失败:', error);
            throw error;
        }
    }

    async resolveBug(bugId: number, resolution: BugResolution): Promise<Bug> {
        try {
            this.logDebug(`正在解决Bug ${bugId}...`);
            const response = await this.request<Bug>('PUT', `/bugs/${bugId}`, undefined, {
                status: 'resolved',
                assignedTo: this.config.username,
                ...resolution,
                resolvedDate: new Date().toISOString(),
            });
            this.logDebug('Bug解决请求完成');
            return response;
        } catch (error) {
            console.error('解决Bug失败:', error);
            throw error;
        }
    }

    async createTask(task: CreateTaskRequest): Promise<Task> {
        try {
            this.logDebug('正在创建新任务...');
            if (!task.execution) {
                throw new Error('创建任务需要指定执行ID');
            }

            const endpoint = `/executions/${task.execution}/tasks`;
            const payloads: Array<{ data?: any; params?: any }> = [];

            // payload #1: raw JSON body
            payloads.push({ data: task });

            // payload #2: wrapped JSON body
            payloads.push({ data: { task } });

            // payload #3: x-www-form-urlencoded with flat fields
            const formFlat = new URLSearchParams();
            Object.entries(task).forEach(([key, value]) => {
                if (value !== undefined && value !== null) formFlat.append(key, String(value));
            });
            payloads.push({ data: formFlat });

            // payload #4: x-www-form-urlencoded with task[...] fields
            const formNested = new URLSearchParams();
            Object.entries(task).forEach(([key, value]) => {
                if (value !== undefined && value !== null) formNested.append(`task[${key}]`, String(value));
            });
            payloads.push({ data: formNested });

            let lastResponse: unknown = null;
            for (const payload of payloads) {
                try {
                    const response = await this.request<any>('POST', endpoint, payload.params, payload.data);
                    lastResponse = response;
                    this.logDebug('创建任务请求完成', { responseType: typeof response });
                    if (response && typeof response === 'object' && Number((response as any).id) > 0) {
                        return response as Task;
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    this.logDebug('创建任务请求失败，尝试下一种参数格式', { msg });
                }
            }

            // Some Zentao deployments return sparse/invalid success payloads.
            // Fallback by querying execution task pages and matching by exact task name.
            const matched = await this.findTaskByNameInExecution(task.execution, task.name);
            if (matched) return matched;

            if (lastResponse && typeof lastResponse === 'object') {
                return lastResponse as Task;
            }

            throw new Error('创建任务返回异常，且未在执行中查询到新任务');
        } catch (error) {
            console.error('创建任务失败:', error);
            throw error;
        }
    }

    private async findTaskByNameInExecution(executionId: number, taskName: string): Promise<Task | null> {
        const maxPages = 20;
        for (let page = 1; page <= maxPages; page++) {
            const listResp = await this.request<{ tasks?: Task[]; total?: number; limit?: number }>(
                'GET',
                `/executions/${executionId}/tasks`,
                { status: 'all', page }
            );
            const tasks = listResp.tasks || [];
            const matched = tasks.find((item) => item?.name === taskName);
            if (matched) return matched;

            const pageSize = Number(listResp.limit) || 100;
            const total = Number(listResp.total) || tasks.length;
            if (tasks.length === 0 || page * pageSize >= total) break;
        }
        return null;
    }
}
