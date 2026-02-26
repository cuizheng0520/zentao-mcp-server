# Zentao MCP Server

面向禅道（Zentao）的 MCP 服务，提供项目、任务、Bug 的查询与更新能力。

## 项目简介

本项目将常用禅道操作封装为 MCP Tools，供 MCP Client 通过 `stdio` 方式调用。

核心目标：

- 用统一工具访问禅道项目、执行、任务、Bug 数据
- 提供稳定的任务创建、更新、完成与 Bug 处理流程
- 保持配置与缓存可控，便于本地与服务器部署

## 功能概览

### 初始化

- `initZentao`：加载配置并初始化 API 连接

### 项目与执行

- `getProducts`：查询产品列表
- `getProjects`：查询项目列表（支持缓存刷新）
- `getExecutions`：查询执行（可按项目筛选）
- `getProjectTaskCount`：按项目与状态统计任务数

### 任务

- `getMyTasks`：查询任务（支持按状态/项目/执行过滤）
- `getTaskDetail`：查询任务详情
- `createTask`：创建任务
- `updateTask`：更新任务
- `finishTask`：完成任务

### Bug

- `getMyBugs`：查询 Bug 列表
- `getBugDetail`：查询 Bug 详情
- `resolveBug`：解决 Bug

## 快速开始

### 环境要求

- Node.js `>= 18`
- 可访问的禅道服务地址
- 禅道账号凭据（建议使用独立低权限账号）

### 安装与构建

```bash
npm install
npm run build
```

### 启动 MCP 服务

```bash
node dist/index.js
```

在 MCP Client 中将该进程配置为 `stdio` 类型服务。

## 最小可用流程

1. 调用 `initZentao` 完成初始化
2. 调用 `getProjects` 确认项目
3. 调用 `getExecutions` 确认执行（迭代）
4. 调用 `getMyTasks` 或 `getProjectTaskCount` 进行业务查询

说明：除 `initZentao` 外，其余工具都依赖已初始化连接；未初始化会报错 `Please initialize Zentao API first`。

## 配置说明

默认读取路径：

- `./.zentao/config.json`

可通过环境变量自定义配置目录：

- `ZENTAO_CONFIG_DIR=/path/to/secure-dir`

可通过启动参数注入配置：

```bash
node dist/index.js --config '{"config":{"url":"https://your-zentao-url","username":"your-username","password":"your-password","apiVersion":"v1"}}'
```

建议：

- 提交 `./.zentao/config.example.json` 作为模板
- 不要提交 `./.zentao/config.json`（真实凭据）
- 生产环境优先使用安全目录与密钥管理方案

## MCP Client 接入示例

以 `stdio` 方式接入：

- command: `node`
- args: `dist/index.js`
- cwd: 本项目根目录

## 主要工具参数（简版）

- `getProjects(refresh?: boolean)`
- `getExecutions(projectId?: number)`
- `getProjectTaskCount(projectId: number, status?: string)`
- `getMyTasks(status?: string, includeAll?: boolean, executionId?: number, projectId?: number, limit?: number)`
- `getTaskDetail(taskId: number)`
- `createTask(task: { name: string; execution: number; ... })`
- `updateTask(taskId: number, update: { consumed?: number; left?: number; status?: 'wait'|'doing'|'done'; finishedDate?: string; comment?: string })`
- `finishTask(taskId: number, update?: { consumed?: number; left?: number; comment?: string })`
- `getMyBugs(status?: 'active'|'resolved'|'closed'|'all', productId?: number)`
- `getBugDetail(bugId: number)`
- `resolveBug(bugId: number, resolution: { resolution: 'fixed'|'notrepro'|'duplicate'|'bydesign'|'willnotfix'|'tostory'|'external'; resolvedBuild?: string; duplicateBug?: number; comment?: string })`

## 开发说明

代码结构：

```text
src/
  api/
    zentaoApi.ts
  tools/
    registerInitTools.ts
    registerTaskTools.ts
    registerProjectTools.ts
    registerBugTools.ts
    toolContext.ts
  types/
    zentao.ts
  server.ts
  index.ts
```

常用命令：

```bash
npm run build
```

## 安全与注意事项

- 日志输出到 `stderr`，避免污染 MCP `stdout` 协议流。
- `getProjects` 默认启用缓存（内存 -> 文件 -> 远端）。
- 项目缓存默认路径：`~/.zentao/cache/projects.json`，可通过 `ZENTAO_CACHE_DIR` 自定义。
- 建议在 CI 中增加敏感信息扫描，避免将真实配置或凭据提交到仓库。

## Roadmap

可扩展能力（按需实现）：

- 任务生命周期：`delete/close/activate/assign`
- 项目/执行详情：`getProjectDetail`、`getExecutionDetail`、`getExecutionTaskCount`
- Bug 生命周期：`createBug`、`assignBug`、`closeBug`、`activateBug`
- 产品详情：`getProductDetail`

## License

MIT
