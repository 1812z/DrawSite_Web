# 前端当前进度

本文档记录 `DrawSite_Web/`（平台文档中旧称 `web/`）的当前实现进度、接口对齐状态与限制。
接口契约以仓库 `docs/backend-api.md` 与后端源码为准；本文档只描述前端。

最后更新：2026-10-19（本次仅同步文档：核对后端 10-03 18:41–19:05 的 `network` / `progress` 模块、`builtin` / `required` 字段与插件删除；前端代码未改动）

## 一、位置与运行

| 项 | 内容 |
| --- | --- |
| 目录 | `DrawSite_Web/`（后端 `DrawSite/` 不动） |
| 技术栈 | Vite 8 + Vue 3.5 + TypeScript 6 + Tailwind v4 + reka-ui + `@lucide/vue` + Pinia 4 + vue-router 5 |
| 开发 | `npm run dev` → http://localhost:5173 |
| 代理 | `/api` → `http://localhost:8080`（`vite.config.ts`，`strictPort: true`） |
| 检查 | `npm run build`（`vue-tsc -b && vite build`） |
| 后端依赖 | Spring Boot 4.1.1 / Java 21 / PostgreSQL / Flyway，端口 8080 |

## 二、当前阶段

已接入账号（注册 / 登录 / 会话）、应用管理、应用工作区与项目文档、**AI 基础对话（异步任务 + SSE 快照 + 取消 + 多轮历史 + 首轮自动标题）**、**运行过程与工具调用（工具模块目录 + 按次选择 + 过程展示）**、**记忆（项目 `AGENTS.md` + 用户全局单条）**、**询问细节（模型反问表单）**；个人资料与密码编辑、记忆管理、管理员用户管理与平台设置已实现。

工具模块现在共五个：`file / 文件操作`、`clarification / 询问细节`、`progress / 进度管理`（三者**强制开放**）、`network / 网络访问`、`globalMemory / 全局记忆`（二者可选，后者还受记忆开关约束）。前端目录是通用的，新增模块会自动出现，**但当前选择与计数逻辑与 `required` 语义不符**，见「六、已知缺陷」。

仍未实现（后端也没有接口，前端不做假接口覆盖）：Docker 构建、平台 API 测试执行器、预览与元素定位、版本恢复、发布、自动 Git 提交、工具执行回滚。`progress.json` 的**结构化**展示前端也未做（后端已有 schema 校验与读写工具）。

## 三、接口对齐状态

前端 `src/api/*` 的每一个调用都逐个对照后端 Controller 核对过，路径、方法、请求体、响应字段全部一致。

| 前端模块 | 请求 | 后端实现 |
| --- | --- | --- |
| `auth.ts` | `POST /api/auth/register` | `AuthController.register` |
| `auth.ts` | `POST /api/auth/login` | `AuthController.login` |
| `auth.ts` | `GET /api/auth/me` | `AuthController.me` |
| `auth.ts` | `POST /api/auth/logout` | `AuthController.logout` |
| `system.ts` | `GET /api/system/health` | `SystemController.health` |
| `users.ts` | `PUT /api/users/me` | `UserController.updateProfile` |
| `users.ts` | `PUT /api/users/me/password` | `UserController.changePassword` |
| `users.ts` | `GET /api/admin/users` | `UserController.list` |
| `users.ts` | `GET /api/admin/users/{id}` | `UserController.detail` |
| `users.ts` | `PUT /api/admin/users/{id}` | `UserController.update` |
| `users.ts` | `PUT /api/admin/users/{id}/password` | `UserController.resetPassword` |
| `applications.ts` | `GET/POST /api/applications` | `ApplicationController.list / create` |
| `applications.ts` | `GET/PUT/DELETE /api/applications/{id}` | `ApplicationController.detail / update / delete` |
| `applications.ts` | `GET /api/applications/{id}/revisions` | `ApplicationController.revisions` |
| `applications.ts` | `GET /api/applications/{id}/documents?path=` | `ApplicationController.document` |
| `conversations.ts` | `GET/POST /api/applications/{id}/conversations` | `ConversationController.list / create` |
| `conversations.ts` | `PUT/DELETE .../conversations/{cid}`（重命名 / 删除） | `ConversationController.rename / delete` |
| `conversations.ts` | `GET/POST .../{cid}/messages` | `ConversationController.messages / addMessage` |
| `settings.ts` | `GET /api/platform/public-settings` | `SettingsController.publicSettings` |
| `settings.ts` | `GET/PUT /api/admin/settings` | `SettingsController.adminSettings / update` |
| `agent.ts` | `POST .../conversations/{cid}/runs`（202） | `AgentController.start` |
| `agent.ts` | `GET .../runs/{runId}` | `AgentController.get` |
| `agent.ts` | `POST .../runs/{runId}/cancel` | `AgentController.cancel` |
| `agent.ts` | `GET .../runs/{runId}/events`（SSE，无统一响应外壳） | `AgentController.events` |
| `agent.ts` | `GET/PUT/DELETE /api/users/me/memory`（用户级单条全局记忆） | `MemoryController` |
| `agent.ts` | `GET/POST /api/applications/{id}/conversations/{cid}/clarifications[/{qid}/answers]` | `ClarificationController` |
| `agent.ts` | `GET /api/agent/tools`（工具**模块**目录，需登录） | `ToolController.list` |

**未接（后端已实现）**：`GET /api/applications/{id}/tools` —— 后端 `catalog(app)` 直接 `return catalog()`，与全局目录完全相同，接了也没有额外信息，故不接。

**后端已删除、前端无残留**：插件体系（`V9__project_plugins.sql` 建表、`V10__remove_plugins.sql` 删表，`PLUGIN_ROOT` 与项目插件配置接口一并移除）。已确认 `DrawSite_Web/src` 内 `plugin` / `插件` / `PLUGIN` **零匹配**，前端本来就没有插件 UI，无需改动。

AI 对话契约以 `docs/agent.md` 为准（后端在 `docs/backend-api.md` 之外单独维护）。要点：

- `runs` 接口**自行保存用户消息**，前端不得再调用 `messages` 接口保存同一条消息。
- 事件流 `snapshot` 事件每约 300ms 推送完整 `RunView`，前端**整体替换**内容，不按 delta 累加；终态再发 `done` 后关闭。
- 原生 `EventSource` 无法附加 `Authorization`，因此用 `fetch` + 手工解析 SSE（见 `api/agent.ts` 的 `streamRun`）。
- `reasoningEffort` 只在模型 `supportsReasoning=true` 时可选，`DEFAULT` 不发送该字段。
- 后端只保存**完成**的回复；失败、超时、取消都不落库，前端不显示半截回复。

### 运行过程（`RunView.phase` / `RunView.steps`，`docs/agent.md` 末尾）

- `RunView` 增加 `phase` 与 `steps`，`snapshot` / `done` 仍然发完整快照。
- `phase` ∈ `WAITING_MODEL` / `THINKING` / `CALLING_TOOL` / `RESPONDING` / 任务终态。**phase 只描述进行中的阶段，终态要看 `status`**——失败和取消时 `activeRun` 会被保留（要展示过程与诊断块），不能一律写“已完成”。
- `steps` 每项：`id`、`round`、`type`（`WAITING_MODEL` / `THINKING` / `RESPONSE` / `TOOL`）、`title`、`status`（`RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELLED`）、`content`、`toolName`、`startedAt`、`finishedAt`。
- 工具参数与结果**最多各 20000 字符**，必须默认折叠、按需展开，不能直接铺在消息里。
- ⚠️ **运行中要排掉末尾那条 `RUNNING` 的 `RESPONSE` step**：后端 `append` 把文本同时写进 `RunView.content` 和一条 `RESPONSE` step，它的内容就是正在显示的回复正文，不排会重复一遍。这条规则是精确的——`roundFinished` 在**模型响应之后、工具执行之前**触发，RESPONSE step 转 `SUCCEEDED` 与 `content` 被清空发生在同一刻，所以不存在「正文与已收尾步骤同时有内容」的窗口。最终轮的 `RESPONSE` step 由后端移除，最终回复只留在 `content`。
- 消息列表（`MessageEntity.getSteps()`）也返回 `steps`（V6 持久化），历史消息默认空数组；失败与取消的过程只能通过任务详情查，不产生成功助手消息。

### 记忆（`docs/memory.md` 是最新契约，已替代 `agent.md` 里的旧多条记忆说明）

记忆模型整体换过，**旧的应用级多条记忆 CRUD（`/api/applications/{id}/memories`）后端已删除**（`V8__simplify_memory.sql` 直接 `DROP TABLE agent_memory`，不迁移历史数据）：

- **项目记忆 = 工作区里的 `AGENTS.md`**，不是数据库记录。它按普通项目文件进 Git，由 AI 通过文件工具读写（写入仍需 sha256）。
  - 前端复用现成的文档接口读：`GET /api/applications/{id}/documents?path=AGENTS.md`（`AGENTS.md` 本来就在后端允许的文档路径里）。文件不存在返回 404 `DOCUMENT_NOT_FOUND`，这是**正常空态**而不是错误。
  - 前端的「文档」标签**不再列出** `AGENTS.md`（`DOCUMENTS` 数组已去掉它），只在「记忆」标签展示，避免两个标签重复列同一个文件。
  - 用户本人查看文档不受 `memoryEnabled` 影响，那个开关只约束 AI。
- **用户全局记忆 = `user_memory` 表，每用户一条、最多 4000 字符**：`GET/PUT/DELETE /api/users/me/memory`。没有记录时后端返回空 `content` + `null updatedAt`（不是 404）；PUT 会 `strip()`，允许空字符串。
  - UI 放在**设置页新增的「记忆管理」栏目**（`MemorySettingsView.vue`，用户级设置，所有登录用户可见，不需要管理员）。
- `memoryEnabled` 语义变了：不再只是「注入不注入」，而是**控制 AI 对项目记忆文件的可见性与读写权限**。关闭时后端从目录列表与搜索里隐藏 `AGENTS.md`，并禁止读取、写入、补丁、替换、删除、移动、创建（大小写不敏感，子目录同名同样受限）。权限绑定任务，不依赖模型遵守提示词。工具栏上的开关因此从「注入记忆」改名为「记忆」，并补了说明性 `title`。
- **工具模块现在是五个**（按 `name` 排序，前端目录通用，不用改）：`file / 文件操作`、`clarification / 询问细节`、`progress / 进度管理`、`network / 网络访问`、`globalMemory / 全局记忆`。
  - `ProjectToolModule` 新增 `available(ToolContext)`，注册器 `bindModules` 对不可用的模块**静默 `continue`**，既不报错也不进模型可见的工具集。`globalMemory` 的 `available` 就是 `context.memoryEnabled()`，所以「勾了全局记忆但关掉记忆开关」是**无声失效**——前端在输入框上方的常驻提示里补了一句说明。
  - `globalMemory` 的工具级错误码：`MEMORY_CONFLICT`（并发改动，重新读取再合并）、`MEMORY_DISABLED`（任务关闭了记忆）。
- **工具目录多了 `builtin` 与 `required` 两个字段**（`ToolView(id, name, description, builtin, required)`）：`builtin` 恒为 `true`（全部内置，无插件）；`required` 恰好是 `file` / `clarification` / `progress` 三个模块，**选中与否都会注入**（见下）。
  - ⚠️ 前端 `ProjectTool` 目前**只有 `id/name/description`，还没接这两个字段**，因此按钮计数与「未选」文案与后端实际行为不一致（见「已知缺陷」）。

### 询问细节（`docs/agent.md` 末尾「询问细节工具」）

模型可以调用 `askDetails(questions)` 反问用户（1–3 个问题，每题 0–5 个候选项）。调用后任务仍是 `RUNNING`，但 `phase` 变成 `WAITING_USER`，`RunView.pendingQuestion` 带回待回答的询问；等待期间暂停模型超时、不继续工具循环。

- `ClarificationForm.vue` + `agent.ts` 的 `listClarifications` / `answerClarification` 已接；`Clarification` 含 `{id, runId, conversationId, questions, answers, status, createdAt, answeredAt}`，`status` ∈ `PENDING / ANSWERED / CANCELLED`。
- 提交要一次答完所有题（`questionIndex` 从 0 开始、完整不重复），每题至少选一个候选项或填非空 `customText`，否则 400 `INVALID_ANSWERS`；重复回答或任务已停止 409 `QUESTION_NOT_PENDING`。
- 刷新后从询问列表恢复待回答表单并重新订阅原 run（`runId` 在询问记录里）。

删除语义（`docs/backend-api.md`）：

- `DELETE /api/applications/{id}`：清理工作区目录（含 `.git`、依赖与产物，以及项目记忆 `AGENTS.md`）、会话消息、对话任务、询问记录与版本记录，**保留用户级全局记忆、用户账号与平台设置**。后端自动停止该应用全部回复，前端**不需要**先 `cancel`。初始化中返回 409 `APPLICATION_BUSY`；目录清理失败返回 500 `WORKSPACE_DELETE_FAILED` 且保留数据库记录，可重试；目录已不存在时仍会清理数据库。
- `DELETE /api/applications/{id}/conversations/{cid}`：清除该会话全部消息、对话任务与询问记录并自动停止回复，不影响应用源码、版本、项目记忆 `AGENTS.md` 或用户全局记忆。
- 两者都是「文件系统清理 + 数据库事务」两步，**不是原子的**，失败时可能已删掉部分文件，所以界面文案里明确写了「可重试」。

工具调用契约以 `docs/project-tools.md` 为准。前端实现要点：

- ⚠️ **`GET /api/agent/tools` 返回的是工具「模块」，不是单个函数**：每项 `{id, name, description, builtin, required}`，按 `name` 排序，**全局共用、不区分应用**，需登录。`GET /api/applications/{id}/tools` 也存在，但后端 `catalog(app)` 直接 `return catalog()`，内容与全局目录**完全相同**，所以前端不必接。
  - **显示 `name`，提交 `id`**（`toolNames: ["file"]`）。选中模块即开放该模块下全部函数。
  - 后端 `select()` 只认模块 `id` 或**原来的函数名**（兼容路径），提交模块的中文 `name` 会直接 400 `TOOL_NOT_AVAILABLE`——前端不要展开到函数名，也不要拿 `name` 当提交值。
  - 目录变化时按 `id` 求交集，避免提交已移除的模块。
- **门控的真实规则**（`AgentService.start` + `ProjectToolRegistry`）：
  - `AgentService` 里的局部变量 `toolsEnabled` 取的是 **`model.supportsTools()`（模型能力）**，不是请求里的 `toolsEnabled` 字段，读代码时别被同名误导。它只决定「走工具循环还是纯对话」以及系统提示词。
  - 真正筛模块的是 `bindModules`：`file` / `clarification` / `progress` 三个 `required` 模块**无论选中与否都注入**；其余模块（`network`、`globalMemory`）在 `selected` 非空时要求 `selected.contains(module.id())`。
  - `select(null)`（即**省略 `toolNames`**）直接 `return available`，等于**全部模块**。
  - **唯一能真正关掉工具的请求值是 `toolsEnabled: false`**：`if (Boolean.FALSE.equals(request.toolsEnabled())) selectedTools = Set.of();`。注意它只清空「可选的」集合，`required` 三个模块仍会注入（因为它们是在 `bindModules` 里按 id 无条件通过的）。
  - 所以文档里「`toolNames: []` 等于关闭全部工具」的说法**对 `required` 模块不成立**。
- 开启工具时模型必须 `supportsTools=true`，否则 400 `TOOLS_UNSUPPORTED`。前端在**模型不支持时干脆不下发这两个字段**，并在面板里说明本次不生效、去哪儿打开。
- **前端没有工具总开关**：是否开启是推导出来的——`supportsTools && 选中模块数 > 0`（见 `effectiveToolsEnabled`）。两个条件缺一就两个字段都不下发，等于纯对话。按钮文案直接反映这个推导结果，不需要用户手动开。
- 未知模块 id 在提交任务前返回 400 `TOOL_NOT_AVAILABLE`（不是异步错误码）。
- 后端限制：最多 12 轮工具循环、累计 40 次工具调用，超出按 `MODEL_REQUEST_FAILED` 结束；写入立即落盘，**取消不回滚已完成写入**，任务失败也保留已落盘修改。这两条已经写进输入框上方的说明文案。
- 执行过程现在**可见**（见上「运行过程」）。历史上那条「写入类工具要求先拿到 sha256，所以要提醒用户一起选 readProjectFile」的提示**已经删掉**：选择粒度是模块，选中 `file` 就包含 `readProjectFile`，该提醒在模块粒度下不可能触发。

### 网络访问（`docs/network-tools.md`）

`network / 网络访问` 是**可选**模块（不在 `required` 里），两个函数：`httpRequest(url, method?, headers?, body?)`（GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS，默认 GET，返回 status/headers/body/truncated，非 2xx 也正常返回）与 `downloadResource(url, path, expectedHash)`（GET 下载到项目相对路径，新建 `NEW`、覆盖要现有文件 sha256，只接受 2xx，不允许二进制覆盖 `AGENTS.md` 或 `progress.json`）。

- 连接超时 10 秒、总请求最多 30 秒、请求体与响应各最多 2MB、文本最多展示 40000 字符；**不自动跟随重定向、不执行网页脚本、无搜索引擎检索**。
- 后端把网络等待放在应用事务锁之外，下载写入时重新检查任务状态与权限。
- ⚠️ 前端 `ToolPicker` 目前**默认全选**，所以默认就会把这个模块一起开出去；而面板与输入框的文案只写「读写当前项目文件」，**没有提模型可以发起外网请求、把资源下载进项目**。这是当前文案与能力的偏差（见「已知缺陷」）。

### 进度管理（`docs/project-tools.md`）

`progress / 进度管理` 是**强制开放**模块，两个函数：`readProgress()` 与 `writeProgress(content, expectedHash)`。写入要过 schema 校验：最多 100000 字符，`schemaVersion` 必须是 `1.0`，`features` 数组最多 500 项，每项要有唯一非空 `id`、非空 `title`、`status` ∈ `TODO / IN_PROGRESS / READY_FOR_VERIFICATION / BLOCKED`、非空字符串数组 `acceptanceCriteria`，可选 `notes`（字符串）。校验不过返回 `IllegalArgumentException`（工具结果里的 `message`）。

- 后端系统提示词里明确要求「不能把未经平台验证的结果标为测试通过」，与需求文档里「AI 不自行决定测试成功」一致；前端展示进度时也不应把 `READY_FOR_VERIFICATION` 读成「已通过」。
- 前端目前**没有**进度结构化展示：`progress.json` 仍走「文档」标签的 JSON 格式化预览（`prettyJson`），未按 `features / status` 渲染。

### 注意：旧交接总结中的接口名有误

仓库外的旧交接总结写了三处与后端不符的接口，**不要按它改前端**：

| 旧总结写法 | 实际实现 |
| --- | --- |
| `GET /api/applications/{id}/files/*` | `GET /api/applications/{id}/documents?path=`（单文档，path 走查询参数） |
| `PATCH .../conversations/{id}` 重命名 | `PUT .../conversations/{id}` |
| `GET .../messages?before=<id>` | `GET .../messages?page=&size=`（升序分页，默认 size=50） |
| `GET /api/users/me` 取当前用户 | `GET /api/auth/me` |

文档路径允许清单（后端 `WorkspaceService.DOCUMENTS`）：`AGENTS.md`、`docs/requirements.md`、`docs/design/overview.md`、`docs/design/detail.md`、`progress.json`、`api/openapi.json`。

## 四、已实现能力

1. **认证**：`/login` 登录 / 注册同页切换；注册成功自动登录；登录前读 `public-settings` 控制注册入口（接口不可达时降级为开启，后端仍执行真实校验）。
   - `stores/auth.ts`：token / user 持久化到 `drawsite:token`、`drawsite:user`，导出 `setUser`、`clear`。
   - `lib/http.ts`：统一 `Bearer` 头、业务 `code !== 'OK'` 视为失败、401 清会话并跳登录、非 JSON 网关错误（如后端未启动的 502）转可读文案。
   - 路由守卫 + `App.vue` 按 `route.meta.public` 决定是否包 `AppLayout`。
2. **应用管理**：`ApplicationsView.vue` 分页列表、新建 / 编辑对话框（名称 ≤100、描述 ≤2000），创建后刷新侧栏；行内 `删除` 走 `ConfirmDialog` 二次确认，删掉当前页最后一条时自动回退一页。
3. **应用工作区**：`ApplicationDetailView.vue`（`/applications/:id`）。
   - 整体左右两半：**左半** = 对话历史 + 悬浮 `RequirementComposer`；**右半** = 自带顶栏（概览 / 文档 / 版本 / 记忆 + 收起）与内容区，两侧各自独立滚动。
   - 右半默认 40% 宽、可拖拽（20%–70%）、宽度记忆在 `drawsite:side-panel-width`；收起后右半变成 44px 窄轨，只留展开按钮。
   - 概览承载应用标题、描述、状态徽章、刷新按钮（重取应用信息 + 已保存消息，静默刷新不切整页加载态）与当前提交 / 创建 / 更新时间；其余仍为占位。文档只读渲染（`MarkdownView.vue` = marked + DOMPurify 净化，禁止直接 `v-html` 原始内容），JSON 文档走格式化预览；版本分页；记忆（见下）。右半内容区滚动用组件库 `ScrollArea`。
   - 消息：加载第 1 页后可继续“加载更早的消息”（仅在还有更早消息或首次加载中才显示这一行）。
4. **AI 对话**：工作台提交即调用 `runs` 接口，进入异步任务并订阅 SSE。
   - 工具栏（`RequirementComposer` 的 `#toolbar` 插槽）：模型选择（来自平台公开配置）、思考强度（仅 `supportsReasoning` 模型显示）、工具调用（`ToolPicker.vue`）、`记忆` 开关。
   - 生成中显示独立气泡，内容随快照整体替换，带“停止”按钮调用 cancel；终态落库后气泡消失、回复转为正式消息，不会重复渲染。
   - 消息正文（用户侧与助手侧都是）与生成中的气泡都用 `MarkdownView.vue` 渲染，不走 `whitespace-pre-wrap` 裸文本；输入框保持纯文本，不做预览。
   - 首轮回复成功后侧栏会话标题由服务端异步生成，前端在 `done` 时刷新一次、3 秒后再刷新一次会话列表。
   - 错误文案统一走 `lib/errors.ts` 的 `API_ERROR_MESSAGES`，同步错误码（`ApiError.code`）与异步错误码（`RunView.errorCode`）共用一张表，不展示服务商原始错误。
5. **工具调用**：`ToolPicker.vue` + `api/agent.ts` 的 `listTools`。
   - 入口是工具栏上的一个按钮，文案直接反映状态：`工具 · 模型不支持` / `工具 · 文件操作`（只有一个模块时直接报模块名）/ `工具 · 全部 N` / `工具 · 3/9` / `工具 · 未选`；真的会调用工具时按钮描边加深。**没有“关闭”这个状态**，因为开启与否是推导的（见上）。
   - 弹出面板里是「标题 + 全选 / 清空」一行，下面是**模块**列表（`GET /api/agent/tools`，进工作区时取一次，**默认全选**）。每项显示 `name`（模块名）与 `description`，点击整行切换；选中状态与提交值都是 `id`。
   - ⚠️ 面板里那句「让模型读写当前项目文件，写入立即落盘」只覆盖了 `file` 模块的能力；`network` 能发外网请求并下载资源到项目，`progress` 会改 `progress.json`，文案没写全（见「六、已知缺陷」）。
   - 列表项的间距写在插槽内的 `div.space-y-1` 上，不能写 `viewportClass`（原因见界面约定的 ScrollArea 条目）。
   - 选择状态由前端维护（`selectedToolIds`，装的是模块 id）、随每次请求提交；切换会话不重置（组件不重建），刷新页面回到默认全选。
   - 模型不支持工具时面板内给出说明，并且**不下发** `toolsEnabled` / `toolNames`，避免 400 `TOOLS_UNSUPPORTED`。
   - 输入框上方说明文案跟着实际能力走：会调用工具时写明「已开启 N 个工具模块，模型可以读写当前项目文件；写入立即落盘，取消不会回滚已完成的修改」，其余情况分别写明「模型未开启工具支持」「后端没有可用工具」「没有勾选任何工具模块」。
6. **运行过程展示**：`RunProcess.vue`，数据是 `RunView.steps`（运行中）或消息自带的 `steps`（已落库）。
   - 折叠面板「过程 · N 步」，**运行中默认展开、跑完自动收起**；有失败步骤时在标题旁标红「有失败」。
   - 每步一行：状态图标（转圈 / 勾 / 叉 / 禁止）+ `title` + 真实函数名 `toolName` + 耗时；只有多轮时才显示「第 N 轮」，避免单轮时到处是噪声。
   - `TOOL` 步骤的参数与结果默认折叠（最多 2×20000 字符），展开是等宽 `<pre>`；`THINKING` / `RESPONSE` 的内容用 `markdown-body--compact` 内联渲染，限高滚动。
   - 生成中的气泡：过程在上、回复正文在下；正文用 `streamingText`（即 `RunView.content`）走 markdown 渲染。
   - 终态文案按 `status` 给：`已停止` / `失败` / `已完成`，进行中才用 `phase` 映射（`等待模型响应` / `思考中` / `调用工具中` / `生成回复中`）。
7. **记忆**：右半「记忆」标签 = **项目记忆 `AGENTS.md` 的记忆视角**（`GET /applications/{id}/documents?path=AGENTS.md`）。
   - 顶部一行标题（`项目记忆` + `AGENTS.md`）+ 右侧刷新按钮（AI 会在对话中改这个文件，视图容易过期）。只有标题行，不加说明段落。
   - 没有这个文件时是**空态**（404 `DOCUMENT_NOT_FOUND` 不当错误），文案说明怎么产生它；内容为空时单独一句。
   - `AGENTS.md` **已从「文档」标签的列表里移除**（`DOCUMENTS` 数组不再含它），只在这里展示，两个标签不重复列同一个文件。后端仍把 `AGENTS.md` 当作可读文档路径，只是前端不再列出来。
   - 用户级全局记忆不在这个标签里，在设置页的「记忆管理」。
8. **记忆管理（设置页新栏目）**：`MemorySettingsView.vue`，单条全局记忆编辑器（`GET/PUT/DELETE /api/users/me/memory`）。
   - 多行文本框 + 字符计数（上限 4000，`maxlength` 兜底），`保存` 只在内容相对服务端真的变了时可点，`清空` 走 `ConfirmDialog` 二次确认。
   - 顶部展示 `updatedAt`；没有记录时说明「当前还没有全局记忆」。加载失败与保存失败分别就地报错，不走整页加载态。
   - 这是用户级设置（`/users/me/...`），所有登录用户可见，不受管理员标签影响；标签顺序是 个人信息 / 记忆管理 /（管理员）用户管理 / 平台管理。
9. **左侧层级树**：`AppLayout.vue` 最近的应用 → 会话。应用行默认展开第一个并加载会话；`+` 新建会话（固定标题“新建会话”，不弹输入框）；会话行悬停显示重命名（对话框改名）与删除（`ConfirmDialog` 二次确认），删除的是当前打开的会话时自动退回该应用的空工作区。点击会话跳 `/applications/:id?conversation=<id>`。会话侧栏**只在此处**，工作区内不内嵌。
10. **设置页**：`SettingsView.vue` 顶部标签容器（个人信息 / 记忆管理 / 用户管理 / 平台管理），**只有一个标签时隐藏标签栏**。
   - 个人信息：资料编辑（用户名 3–32 位字母数字下划线、显示名称 ≤64）+ 改密（成功后清会话回登录页）。
   - 用户管理（`AdminUsersView.vue`，管理员）：分页、编辑角色 / 启用状态 / 资料、重置密码；编辑自己导致角色或启用变化时跳登录。
   - 平台管理（`AdminSettingsView.vue`，管理员）：注册开关、模型 CRUD、默认模型、`supportsTools` 与 `supportsReasoning` 开关、版本乐观锁 409 `SETTINGS_CONFLICT` 重新加载处理。
11. **首页**：`HomeView.vue` 复用工作台，草稿存 `sessionStorage:drawsite:requirement-draft`（草稿仍是本地草稿，未接 AI）。

## 五、用户锁定的验收项（改动不得破坏）

- 工作区**不**内嵌会话侧栏，会话功能在左侧层级树。
- 新建会话固定叫“新建会话”，不弹输入框。
- “最近的应用”默认展开第一个应用。
- 工作区整体左右两半：左半只放对话与输入框，右半顶栏（概览 / 文档 / 版本 / 记忆 + 收起）与内容区。**标签栏属于右半，不横跨整页。**
- 右侧面板默认 40%、可拖拽、可收起；收起 / 展开瞬时切换，不做宽度动画，仅拖拽调宽时动态变。
- 应用标题、状态徽章、刷新按钮、当前提交与创建 / 更新时间都在右半概览，左半不重复展示；概览其余部分仍为占位。
- `AppLayout` 顶栏已整体移除（原来那条页面标题 + 服务状态都不要了）。服务状态移到侧栏 logo 下方，文案为「已连接 / 已断开 / 连接中」，点击可重新检查。移动端导航按钮改为内容区左上角悬浮按钮（`main` 在移动端保留 `pt-14` 避让）。
- 设置页顶部标签切换，单标签隐藏标签栏；设置页只放设置项，不放服务状态与技术进度说明。
- 注册成功自动登录。
- 模型 ID 校验放行 `:` 和 `.`（规则 `[a-zA-Z0-9_:.-]{1,64}`）。
- 密钥输入为密码框、直接传输保存，不使用环境变量；页面不展示明文，只显示“密钥已配置 / 未配置”；编辑留空保留原密钥。
- 管理接口的 `apiKey` 读取视图为 `apiKeyConfigured` 布尔值（后端不回明文）。
- 平台设置页**没有页面级“保存设置”按钮**：改注册开关、改默认模型、保存模型、删除模型都立即提交。
- 默认模型由管理员在平台设置中选择；改动立即保存。未指定时提交会自动取第一个启用的模型（后端要求启用模型时默认项必须存在且启用）。

### 界面约定（后续统一遵守）

- **布尔开关一律用 `components/ui/switch` 的 `Switch` 组件，不再使用 `<input type="checkbox">`**。开关是“即时生效的状态”，复选框是“表单里待提交的字段”，本平台的状态类布尔值都归前者。
- **渲染 markdown 一律用 `components/MarkdownView.vue`**（marked + DOMPurify），**不要自己写 `v-html`**。项目文档预览与对话消息（用户侧和助手侧都算）共用同一个组件。
  - `marked` 开 `breaks: true`：单个换行也变 `<br>`。模型回复和用户输入都习惯用单换行断句，按 CommonMark 默认行为会并成一段，读起来是粘住的。
  - 净化配置除 `USE_PROFILES: { html: true }` 外，还**显式禁掉 `style` 标签与 `style` 属性**。`<style>` 经 innerHTML 插入是**会生效**的（`<script>` 不会），模型输出里塞一段就能改掉整个页面的样式；`marked` 不生成内联样式（表格对齐用 `align` 属性），禁掉不影响任何 markdown 渲染。
  - 链接通过 `afterSanitizeAttributes` 钩子统一补 `target="_blank" rel="noopener noreferrer"`：在聊天里点链接如果本页跳转，会把 SPA 状态（当前应用 / 会话）整页丢掉。
  - **流式回复也走 markdown**，不要等完成再切：SSE 快照是整段替换的，中途不渲染会在结束时出现一次整块重排。
  - `.markdown-body` 的代码底色用半透明黑（`rgba(0,0,0,.06)`）而不是固定灰。用户气泡本身是 `#f4f4f4`，固定灰的 `--muted`（`#f5f5f5`）在里面差 1/255，等于看不见。
  - 过程面板里的中间文本（`THINKING` / `RESPONSE`）额外加 `markdown-body--compact` 把字号压到 `0.75rem`：默认的 `0.875rem` 挨着 11px 的步骤标题明显过大。
- **下拉选择一律用 `components/ui/select` 的 `Select` 组件，不再使用原生 `<select>`**。
  - `SelectContent` 必须传 `:body-lock="false"`。reka-ui 默认会 `useBodyScrollLock`，给 `body` 加 `overflow: hidden` 与 `padding-right: <滚动条宽度>`，整页被挤窄后工具栏会重新换行，表现为下拉一开一关整行闪一下。
  - `Select` 的 `v-model` 是 `string`；绑定联合类型字段（`ReasoningEffort`、用户角色）时用 computed 中转，不要让 `string` 直接写回联合类型。
- **弹出层用 `components/ui/popover` 的 `Popover`**（`Popover.vue` 包了 reka-ui 的 `PopoverRoot/Trigger/Portal/Content`，`#trigger` 插槽放一个元素）。
  - 默认 `modal=false`，非模态版本**不会**锁 body 滚动，所以没有 `Select` 那个整页重排问题；`Select` 需要显式关掉的 `body-lock` 在这里不需要。
  - 内容会 portal 到 `body`，因此放在 `sticky` 容器里也不会被裁剪。
  - ⚠️ **开关状态必须由包装组件自己持有**（本地 `openState` ref，再用 `:open` + `@update:open` 走 `v-model` 路径），**不能把 `props.open` 直接透传**。内联声明的 `open?: boolean` 会被 SFC 编译器推断成 `type: Boolean`，父组件不传时 Vue 做布尔转换，`props.open` 得到 `false` 而不是 `undefined`；而 reka 用 `passive: props.open === undefined` 判断受控与否，拿到 `false` 就当成受控模式，于是点击只 emit `update:open`、状态没人回写，面板永远打不开（`aria-expanded` 一直 `closed`）。`Dialog.vue` 之所以没踩到，是因为它写成 `interface Props extends DialogRootProps`——基类是**导入的**接口，编译器推不出运行时类型，`open` 上没有 `type: Boolean`，`undefined` 才能原样透传。包装任何 reka 受控组件都按本地 ref 处理。
- **列表型多选不要用一列 `Switch`**：`Switch` 表达“即时生效的状态”，多选列表用可点击行 + `aria-pressed` + 勾选方块（见 `ToolPicker.vue`）。
- **滚动容器用 `components/ui/scroll-area` 的 `ScrollArea`**（reka-ui `ScrollAreaRoot` 系列），不要裸写 `overflow-y-auto`。
  - 结构是「`position: relative` 的根 + `size-full` 的视口」，所以外层要给它 `min-h-0 flex-1` 或明确高度；**padding 通过 `viewportClass` 传**，写在 `class` 上会落到根节点而不是滚动容器。
  - ⚠️ **`space-y-*` / `divide-*` 不能写在 `viewportClass` 上**。`ScrollAreaViewport` 在视口里还会再套一层**无 class 的包装 `div`** 才渲染插槽，视口的唯一子节点是那层包装，`space-y-*` 只作用在它身上，插槽里的兄弟节点之间依然是零间距（表现是列表项圆角底色互相贴住、hover 高亮看着像重叠）。间距要写在插槽**内部**自己的容器上：`<ScrollArea viewport-class="max-h-60"><div class="space-y-1">…</div></ScrollArea>`。`max-h-*` 写在 `viewportClass` 上是对的，因为它作用于视口元素本身。
  - 高度由内容决定、只封顶的场合（如弹出层里的列表），把 `max-h-*` 写在 `viewportClass` 上：视口的 `h-full` 在 auto 高度父级下退化为内容高度，再被 `max-height` 截断，于是视口自己滚。写成 `class="max-h-*"` 会让根被截断而视口不滚，内容直接溢出。
  - 滚动条的 `top / right / bottom` 与滑块高度由 reka-ui 内联给出，组件里只补宽度（`w-2.5`）和配色（`bg-neutral-300`，滑块 `data-[state=hidden]` 时透明）。
  - 默认 `type="auto"`（有溢出时常显）；另有 `hover` / `scroll` / `always` / `glimpse`。
  - `ScrollAreaViewport` 自带 `tabindex="0"`（键盘滚动）并用内联 `<style>` 隐藏原生滚动条。
  - 已切换：工作区右半内容区。未切换：左侧对话区（带自动滚底逻辑，需要把 viewport 引用透出来）、侧栏「最近的应用」、`ApplicationsView` / `HomeView` / `SettingsView`。
- 读取视图（`AdminModelView` 等）只有 `apiKeyConfigured`，**不能直接当提交体发送**；构造提交体时必须走 `currentConfigs()` 之类的转换，省略 `apiKey` 表示保留服务端已存密钥。
- **整页不滚动**：`AppLayout` 根节点是 `h-dvh overflow-hidden`（已无顶栏，`main` 直接填满），滚动只发生在各视图自己的容器里。
  - 页面内容必须自带 `min-h-0 flex-1 overflow-y-auto`（`ApplicationsView`、`HomeView`、`SettingsView` 已如此），否则内容会被裁掉而不是滚动。
  - 工作区左半只有对话：滚动容器 `min-h-0 flex-1 overflow-y-auto` 铺满整个左半，输入框用 `sticky bottom-0` 贴底悬浮（外层列 `min-h-full`，消息容器 `flex-1`）。这样滚动条贯穿整个左半高度，消息再多也不撑高页面。
  - 输入框位置随会话内容变：会话**没有消息**时，列里在输入框下方补一个等高的 `flex-1` 空隙，把输入框顶到垂直居中（同时显示引导文案与示例卡片）；发出第一条后空隙消失，输入框落到底部悬浮。
  - 新内容自动滚到底：`scrollRef` 上挂 `onScroll` 记录是否贴底（距底 48px 内算贴底），提交、切换会话、刷新时强制滚底，流式快照与落库回复只在贴底时跟随——用户手动往上翻时不打断。
- `RequirementComposer` 的输入框：默认一行（`rows="1"`），随内容自动长高，最多 15 行（`resize()` 按计算后的 `line-height` 与 padding 求上限），超过后输入框内部滚动。`resize-none`，不允许手动拖高。
- 提示行只在有状态时出现（生成中、未配置模型等），不再显示「Enter 提交，Shift+Enter 换行」。**行为未变**：Enter 仍提交，Shift+Enter 仍换行。
- **错误码文案统一放 `lib/errors.ts` 的 `API_ERROR_MESSAGES`**（来源 `docs/backend-api.md` 与 `docs/agent.md`），对话任务的同步 / 异步错误码也在同一张表里。展示用 `describeError(cause, fallback)`，它会把错误码与 HTTP 状态附在文案后面，便于排查。新增错误码只改这一处。
- **删除类操作一律走 `components/ConfirmDialog.vue`**（`destructive` + `loading` + `error` 三个属性由调用方控制）。后端删除应用 / 会话时会自动停止回复并清理任务，前端**不要**先调 `cancel`。
- 删除应用可能清理整个工作区目录（含依赖与产物），`deleteApplication` 单独把超时放宽到 120 秒，不用 `request` 的默认 15 秒。

## 六、当前限制与已知缺陷

### 已知缺陷（前端与最新后端不一致，代码尚未修）

后端在 2026-10-03 18:41–19:05 又改过一轮（新增 `network` / `progress` 模块、工具目录加 `builtin` / `required`、删除插件体系），前端**停在 18:39**，以下三处是核对源码后确认的真实偏差：

1. **「清空」工具会静默开放全部工具** —— 最严重。`ApplicationDetailView.vue` 的 `effectiveToolsEnabled = canUseTools && selectedToolIds.length > 0`，未勾选时把 `toolsEnabled` 与 `toolNames` **一起省略**（`undefined`）。但 `select(null)` 返回全部模块，且 `AgentService` 只在 `toolsEnabled === false` 时才清空，于是「模型支持工具 + 两个字段都省略」→ **全部模块被注入**，包含 `network` 与 `globalMemory`。UI 却显示「本次会按纯对话处理」。
2. **`required` 模块永远开放**，所以「未选 = 纯对话」在模块粒度上做不到：`file` / `clarification` / `progress` 无论选中与否都注入，连 `toolNames: []` 也一样。**唯一真正的关闭值是 `toolsEnabled: false`**。
3. **计数与文案误导**：`工具 · 2/5` 暗示只开 2 个，实际那 3 个强制模块一直在跑；「没有选择任何工具模块，本次会按纯对话处理」是错的。

附带一处小的：`lib/errors.ts` 缺 `FILE_CONFLICT`、`FILE_OPERATION_INVALID`、`INTERNAL_ERROR`、`TOOL_FAILED`，这些码会出现在工具步骤结果里，现在以原始 JSON 显示。

修法（待做）：`ProjectTool` 补 `builtin` / `required`；未勾选时下发 `toolsEnabled: false`；按 `required` 区分「强制开放」与「可选」，计数只算可选模块；文案区分「强制模块始终可用」与「可选模块未选」。

### 其他限制

- **真实联调未做**：本机后端与 PostgreSQL 未启动，AI 对话链路只通过类型与编译层面验证，未实际调用服务商。需要先配好模型与密钥再手工联调。
- 页面刷新或切换会话时，正在 RUNNING 的任务**不会**在前端恢复订阅（后端没有“按会话列出任务”的接口）。此时回复仍在服务端继续，完成后落库，靠概览里的「刷新」取回。
- 生成中会禁用提交按钮，同一会话同时只允许一个任务（后端 409 `CONVERSATION_BUSY`）。
- 取消不保证停止上游计费（后端限制，前端如实提示“已停止生成，本次回复未保存”）。
- 模型调用失败时前端只能显示后端回传的 `errorCode`；服务商返回的原始报错（401 / 404 / 429 响应体等）**不会回传接口**，`agent_run` 表也只有 `error_code` 没有 message 列。后端已在 `AgentService.onError` 补上 `log.error`，详情去后端日志找关键字 `Model request failed`。
- 预览、API 测试执行器、版本恢复、发布接口后端未实现，前端不做假接口覆盖。
- 文档只读，后端暂无写入文档的 API。
- 左侧层级树会话列表只取第 1 页（size=50），后端支持分页但前端未接分页。
- `api/conversations.ts` 的 `addMessage` 已无调用方（AI 消息改走 `runs`），作为接口绑定保留。
- 未使用的残留代码：`api/users.ts` 的 `getUser`（无调用方）、`components/HelloWorld.vue` 与 `assets/hero.png`、`vite.svg`、`vue.svg`（模板遗留）。

## 七、验证方式

- `npm run build`（vue-tsc + vite build）。
- 单文件结构校验：用 `@vue/compiler-sfc` 的 `parse` / `compileScript` / `compileTemplate` 检查模板与脚本，适合快速确认 `v-if` / `v-else` 等结构改动。
  - 该独立脚本不解析 tsconfig 路径，`components/ui/button/Button.vue`、`components/ui/dialog/Dialog.vue` 的 `interface Props extends PrimitiveProps / DialogRootProps` 会报 “Failed to resolve extends base type”，属脚本局限，非真实错误（`vue-tsc` 通过即正常）。
- 类型检查：`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json`。
- 浏览器回归需前端 5173、后端 8080 同时可用；AI 对话还需管理员在平台设置中配好启用模型 + 密钥 + 默认模型。

## 八、总体进度

### 已完成

- 账号：注册（成功后自动登录）、登录、退出、登录态持久化、Token 失效自动跳登录、注册入口受平台开关控制。
- 应用管理：分页列表、新建、编辑、删除（二次确认）。
- 应用工作区：左右两半布局、右侧面板可拖拽调宽（20%–70%）与收起、概览 / 文档 / 版本 / 记忆四个标签页。
- 会话：侧栏层级树新建、重命名、删除；删除当前会话后自动退回空工作区。
- 概览：应用标题与描述、状态、刷新、当前提交与创建 / 更新时间。
- 文档：只读渲染，Markdown 净化后展示，JSON 格式化预览。
- 版本：分页查看提交记录。
- 记忆：项目记忆 = 工作区 `AGENTS.md`（右半「记忆」标签展示，`AGENTS.md` 已从「文档」标签列表移除）；用户级全局记忆 = 设置页「记忆管理」的单条编辑器（读取 / 保存 / 清空）。旧的 USER/APPLICATION 多条记忆列表与作用域选择已随后端 V8 一起移除。
- 询问细节：模型反问表单（`ClarificationForm.vue`），`phase=WAITING_USER` 时在回复过程下方展示，必须答完所有问题才能提交；刷新后从询问列表恢复待回答表单。
- AI 对话：异步任务 + SSE 流式回复、模型与思考强度选择、记忆开关、停止生成、多轮历史、首轮自动生成标题、失败诊断块与错误码提示、新内容自动滚到底、**消息（用户与助手）markdown 渲染**。
- 工具调用：工具**模块**目录拉取、按模块多选（默认全选，提交模块 id）、开启状态由「模型支持 + 已选非空」自动推导、模型不支持时不下发并说明、不可回滚写入的常驻提示。后端现有五个模块（`file` / `clarification` / `progress` 强制开放，`network` / `globalMemory` 可选），目录通用故新增模块自动出现。
- 运行过程：`RunView.phase` 阶段文案 + `RunView.steps` 折叠展示（运行中展开、跑完收起），工具调用可展开看参数与结果；历史助手消息回放已落库的 `steps`。
- 设置：个人信息与改密、用户管理（角色、启用、重置密码）、平台设置（注册开关、模型增删改、默认模型、密钥、支持工具 / 推理开关）。
- 界面规范：统一使用组件库的 Switch / Select / ScrollArea / Popover、整页不滚动、输入框一行起自动长高、服务状态在侧栏。

### 未完成

- 真实联调：后端与 PostgreSQL 未启动，全部验证只到类型与编译层面。
- 对话之外的能力：Docker 构建、平台 API 测试执行器、预览与元素定位、版本恢复、发布、自动 Git 提交。
- **工具选择语义修正**（见「六、已知缺陷」）：接 `builtin` / `required`、未勾选时下发 `toolsEnabled: false`、区分强制与可选模块、按真实能力改文案。目前「清空」会静默开放全部工具。
- `progress.json` 结构化展示：后端已有 schema 与读写工具，前端仍是 JSON 原文预览，未按 `features / status` 渲染。
- 工具选择状态持久化（当前是组件内存，刷新页面回到默认全选）。
- 工具写入的回滚 / 撤销（后端明确不回滚，需先做自动 Git 提交）。
- 刷新页面时**恢复进行中的任务**：`GET /runs/{runId}` 能拿到 `phase` / `steps`，但前端目前没有「记住上次的 runId 并重连 SSE」的路径，刷新会丢掉生成中的气泡。
- 平台 API 测试执行器、版本恢复、发布。
- 文档写入（后端暂无接口）。
- 左侧会话列表分页（当前只取第 1 页）。
- 服务商原始报错回传前端（接口无该字段，需后端给 RunView 补 message）。
- 刷新页面后无法恢复正在运行任务的订阅（后端没有按会话列出任务的接口）。
- 模板残留清理（`HelloWorld.vue`、`hero.png`、`vite.svg`、`vue.svg`、`api/users.ts` 的 `getUser`、`api/conversations.ts` 的 `addMessage`）。