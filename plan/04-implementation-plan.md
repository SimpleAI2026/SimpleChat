# 04 · 分阶段实现计划

> 风格对齐兄弟项目：先 plan，确认后再写代码。  
> 状态：待你确认下方「开放问题」后进入 Phase 0。

## 0. 工作方式

1. 本目录 plan 审阅通过 → 再初始化 `SimpleChat` 仓库脚手架。  
2. 每阶段结束有可演示产物与验收清单。  
3. 接入 SimpleMind / SimpleExcalidraw 单独立项，不与 Core MVP 绑死同一 PR。

## 1. 里程碑总览

| 阶段 | 名称 | 产出 | 预估 |
| --- | --- | --- | --- |
| P0 | 仓库与协议骨架 | 包结构、类型、假流式 Demo | 0.5–1 天 |
| P1 | 直连 Chat + 流式 + 侧栏 UI | 三项配置可聊、Markdown | 2–3 天 |
| P2 | 历史会话 | IndexedDB 多 thread | 1–2 天 |
| P3 | 宿主工具桥 | registerTool + tool_calls 循环 + UI 卡片 | 2–3 天 |
| P4 | 主题与嵌入抛光 | CSS 变量、Shadow DOM、Vue 适配、Demo | 1–2 天 |
| P5 | 兄弟项目 POC | SimpleMind 侧栏挂载 + ≥1 工具 | 1–2 天 |
| P6 | 安全与文档 | 代理模式草图、README、发布 npm（可选） | 1 天 |

合计 MVP（P0–P4）：约 **1–1.5 周** 全职等效；P5 视 SimpleMind 改动面浮动。

---

## 2. Phase 详情

### P0 · 骨架

- [ ] `pnpm/npm/yarn` workspace（与兄弟项目对齐；SimpleMind 用 yarn —— **待确认包管理器**）
- [ ] `packages/core`：`SimpleChatConfig`、`HistoryStore` 接口、空 `ChatEngine`
- [ ] `apps/demo`：Vite 页面挂载占位侧栏
- [ ] CI：typecheck + vitest 空测
- [ ] LICENSE MIT、README 指向 `plan/`

**验收**：`demo` 能打开空白侧栏；`core` 可单测 import。

### P1 · 对话主路径

- [ ] `POST /chat/completions` + SSE 解析（content 增量）
- [ ] 停止生成（AbortController）
- [ ] 错误提示（401/CORS/网络）
- [ ] 侧栏 UI：消息列表 + Composer
- [ ] 基础 Markdown（代码块复制）

**验收**：Demo 填 Base/Key/Model 后可持续多轮对话（内存历史即可）。

### P2 · 历史

- [ ] Thread CRUD UI
- [ ] IndexedDB `HistoryStore` 默认实现
- [ ] `storageKey` 隔离
- [ ] 可选导出/导入 JSON（Should，可延后）

**验收**：刷新页面会话仍在；删除 thread 生效。

### P3 · 工具桥

- [ ] `registerTool` / `unregisterTool`
- [ ] 请求附带 OpenAI `tools`
- [ ] `tool_calls` 增量合并与执行
- [ ] `maxToolRounds`、错误回灌
- [ ] Tool 调用卡片 UI

**验收**：Demo 注册 `get_page_title` / `alert_message`；模型能调用并体现在回复中。

### P4 · 主题与嵌入

- [ ] 按 `06-ui-views.md` 落地 **shadcn 黑白**默认主题与 ASCII 结构（展开 / 会话列表 / 空状态 / 工具卡）
- [ ] `--sc-*` 变量文档与 Demo（默认黑白；可选自定义 primary）
- [ ] Web Component `<simple-chat>`
- [ ] `@simplechat/vue`（或约定包名）最小封装
- [ ] `layout="sidebar" | "panel"`

**验收**：纯 HTML script 接入与 Vue Demo 各一；默认观感为黑白简洁；改 `--sc-primary` 可换肤。

### P5 · SimpleMind POC（独立确认）

- [x] 在 SimpleMind 决定：继续仅 Built-in，或增设云端通道并把 apiBase/apiKey/model 交给 SimpleChat
- [x] 右侧挂载 SimpleChat，替换/并存弱聊天
- [x] 注册只读 `get_selected_node` + 写入 `add_child_nodes`（权限最小化）
- [x] 历史 `storageKey` 绑定当前导图 id（若可取）

**验收**：在导图里侧栏聊天，能让 AI 通过工具加节点，且历史按图保存。

SimpleExcalidraw 同理作为 P5b，不阻塞 Mind。

### P6 · 硬化

- [ ] README：快速开始、安全警告、代理模式示意（Cloudflare Worker / Vite middleware 伪代码）
- [ ] `proxyUrl` 配置分支（可选实现）
- [ ] 无障碍：焦点、aria、Esc 关闭
- [ ] 包体积目标：压缩后核心 UI **&lt; 80KB gzip**（不含 markdown 高亮则可更低）

---

## 3. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 网关 CORS 拒绝浏览器 | 纯前端不可用 | 文档说明；提供 `proxyUrl`；Demo 用允许 CORS 的网关 |
| 各厂商 SSE / tool_calls 方言不一致 | 流式中断、工具失败 | 先对接 OpenAI + SiliconFlow（SimpleExcalidraw / 常见网关已用）；加兼容层测例 |
| apiKey 泄露舆论/真实损失 | 安全事件 | 默认不落盘 Key；大字警告；推代理 |
| Shadow DOM 与宿主焦点/快捷键冲突 | 侧栏体验差 | `layout=panel` 嵌入宿主抽屉；文档说明 |
| 工具循环打爆 token / 费用 | 账单 | maxToolRounds、maxMessages、UI 显示估算 |
| Vue 与 WC 双维护 | 工期 | Core 单引擎；Vue 只包一层 |
| 过早接 CopilotKit 等重依赖 | 包体与架构锁死 | 坚持自研 Core（见 `02`） |

---

## 4. 开放问题（请确认后再编码）

请直接回复编号选择或改写：

1. **包管理器**：A) yarn（对齐 SimpleMind） B) pnpm C) npm  
2. **npm scope**：A) `@simpleai/simple-chat` B) `@simplechat/core` 等 C) 暂不发布，先 workspace 相对引用  
3. **UI 实现**：A) 原生 Web Component + 自研 DOM（推荐） B) Lit C) 仅 Vue 组件，不做 WC  
4. **默认是否 Shadow DOM**：A) WC 默认开，Vue 适配可关 B) 全程不开  
5. **历史存储**：A) IndexedDB 默认（推荐） B) 仅 localStorage  
6. **MVP 是否实现 `proxyUrl`**：A) P6 再做 B) P1 就做  
7. **兄弟接入顺序**：A) Demo → SimpleMind → SimpleExcalidraw（推荐） B) 其它  
8. **许可证**：A) MIT（推荐） B) Apache-2.0  
9. **是否允许浏览器持久化 apiKey**：A) 不允许，由宿主设置页管（推荐） B) 可选「记住 Key」  
10. **仓库归属**：A) `SimpleAI2026/SimpleChat` B) `linkxzhou/SimpleChat`

---

## 5. 确认后的第一步（P0 检查清单草案）

你确认开放问题后，实现代理应：

1. 在空仓库写入 README（链到 `plan/`）+ LICENSE  
2. 初始化 workspace 与 `packages/core`、`apps/demo`  
3. 落地 `ChatEngine` 类型与一次非流式/流式冒烟测（可用 mock fetch）  
4. **不**在未确认前改 SimpleMind / SimpleExcalidraw 生产代码

---

## 6. 明确不做（再强调）

- 不 Fork LibreChat / Open WebUI / LobeChat  
- MVP 不做 MCP、RAG、多用户、语音  
- MVP 不做完整 Generative UI 框架（工具卡片即可）


---

## 7. 开放问题确认结果（2026-10-29）

| # | 决策 |
| --- | --- |
| 1 包管理器 | **yarn**（对齐 SimpleMind） |
| 2 npm scope | **`@simplechat/*`**（如 `@simplechat/core`） |
| 3 UI | **原生 Web Component + 自研 DOM** |
| 4 Shadow DOM | **WC 默认开，Vue 适配可关** |
| 5 历史存储 | **IndexedDB 默认** |
| 6 proxyUrl | **P6 再做** |
| 7 接入顺序 | **Demo → SimpleMind → SimpleExcalidraw** |
| 8 许可证 | **MIT** |
| 9 apiKey 持久化 | **可选「记住 Key」** |
| 10 仓库归属 | **SimpleAI2026/SimpleChat** |

状态：开放问题已确认；**待用户确认后进入 Phase 0 编码**。
