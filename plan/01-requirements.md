# 01 · 需求澄清与非目标

> 来源：用户对 SimpleChat 的产品描述 + SimpleMind / SimpleExcalidraw 现状  
> 状态：待确认

## 1. 背景与动机

| 项目 | 现状 | 痛点 |
| --- | --- | --- |
| [SimpleMind](https://github.com/SimpleAI2026/SimpleMind) | Vue3 + Vite + Ant Design Vue；**当前仅 Chrome Built-in AI（Prompt API / Gemini Nano）**，已去掉云端 `VITE_API` / Key；选中节点「AI生成」写子节点；扩展/编辑器右侧有 AI 面板 | **没有可复用的对话层**：聊天弱、**不持久化多轮历史**、不能当成侧栏聊天 SDK 给别的页用；若以后要接云端模型，也应复用 SimpleChat |
| [SimpleExcalidraw](https://github.com/SimpleAI2026/SimpleExcalidraw) | Excalidraw 中文 fork；有 `AiDialog` / `AiButton` 等，可配 `BASE_URL` / 模型 | 仍是 **一次性对话框**，不是带历史、可嵌入、可注册宿主 API 的聊天层 |
| **SimpleChat**（新建） | 仓库为空 | 要成为兄弟项目（及任意页面）共用的 **侧栏聊天插件** |

一句话：**把「能聊天、能记历史、能调宿主 API」抽成独立开源前端包，SimpleMind / SimpleExcalidraw 只负责注册工具与主题。**

## 2. 功能需求（Must）

1. **侧栏嵌入**  
   宿主页面可把 SimpleChat 挂在右侧（或左侧）侧栏：可开合、不强制占满整页。支持：
   - npm 包挂载（Vue / React）
   - 脚本标签 / Web Component（任意静态页）

2. **纯前端配置**  
   最少只需：
   - `apiBaseUrl`（OpenAI 兼容，如 `https://api.openai.com/v1` 或 SiliconFlow 等；请求拼 `/chat/completions`，**不要**在 Base 里带该路径——与 SimpleExcalidraw / 常见 OpenAI 兼容网关约定一致）
   - `apiKey`（`Authorization: Bearer …`）
   - `model`（模型 ID 字符串）
   - 可选：`systemPrompt`、温度等

3. **简洁表面 + CSS 主题**  
   UI 克制（消息列表 + 输入框 + 会话切换），**默认采用 shadcn/ui 风格黑白主题**（美观、简洁、大方；见 `06-ui-views.md` ASCII）。插件/宿主可传入 CSS 或 CSS 变量改主题；默认包**不以彩色 accent 出场**。避免侵入宿主全局样式（优先 Shadow DOM 或 scoped CSS variables）。

4. **对话历史**  
   - 多会话（thread）：新建 / 切换 / 删除  
   - 刷新后可恢复（浏览器本地默认持久化）  
   - 宿主可注入自己的存储（例如把某次导图会话与 chat thread 绑定）

5. **宿主 API / 工具注册**  
   接入方把函数注册进插件（名称、描述、JSON Schema 参数、handler）。  
   当模型需要「操控应用」时，走 **OpenAI tools / function calling**：
   - 请求带上 `tools`
   - 模型返回 `tool_calls`
   - 插件在浏览器执行宿主 handler
   - 把 `tool` 角色结果写回 messages，再继续请求直到结束  
   示例：SimpleMind 注册 `addMindMapNodes`；SimpleExcalidraw 注册 `createShapes`。

## 3. 功能需求（Should）

- **流式输出**（SSE / `stream: true`）
- Markdown + 代码块高亮与复制
- 停止生成 / 重试最后一条
- 工具调用过程在 UI 中可见（折叠卡片：工具名、参数摘要、结果摘要）
- 中英文 UI 文案（默认中文，对齐兄弟项目）
- Demo 站点：纯静态页演示配置、侧栏、工具注册

## 4. 功能需求（Could / 后期）

- iframe 嵌入模式（跨域隔离场景）
- 可选「代理模式」：只配 `proxyUrl`，密钥不出浏览器（生产推荐）
- MCP 客户端（浏览器侧）——竞品有，但 MVP 不做
- 附件 / 图片多模态
- 语音输入

## 5. 非目标（Non-goals）

明确 **不做** 这些，避免做成又一个 LibreChat：

| 非目标 | 原因 |
| --- | --- |
| 自建用户体系 / 多租户后台 | 违背「纯前端」 |
| 内置 RAG / 向量库 / 知识库服务 | 属于宿主职责（SimpleMind 已有知识库文本） |
| 完整 Agent 编排平台（Crew / LangGraph 托管） | 过重；工具注册够用 |
| 多 Provider 专用 SDK 全家桶 | 只保证 **OpenAI Chat Completions 兼容** 即可覆盖大多数国内网关 |
| Fork 并维护 LibreChat / Open WebUI / LobeChat | 体量与许可证/架构都不匹配（见 `02`） |
| 强制 React-only | SimpleMind 是 Vue3 |

## 6. 约束与假设

- **开源**：建议 MIT（与 SimpleExcalidraw、多数 chat UI 库一致）；LobeChat 类「Community License」不可当 fork 基座。
- **密钥在浏览器**：MVP 允许（与当前 SimpleExcalidraw 设置一致；SimpleMind 现走端侧 AI、无 Key），但文档必须警示泄露风险，并预留代理模式。
- **CORS**：目标 API 必须允许浏览器跨域，或宿主自备同源代理。
- **兄弟项目接入优先级**：先 Demo → SimpleMind 侧栏替换 → SimpleExcalidraw AI 对话框演进。

## 7. 验收标准（产品级）

1. 任意静态 HTML：引入脚本后，用三项配置即可侧栏对话并流式回复。  
2. 刷新页面后，同一 `storageKey` 下历史会话仍在。  
3. Demo 中注册一个 `getPageTitle` 工具，模型能调用并在回复中用到结果。  
4. 默认黑白 shadcn 风；传入 `--sc-primary` 等 CSS 变量后可换肤，且不明显污染宿主样式。  
5. SimpleMind 能以 npm/workspace 方式挂载，并至少注册 1 个写导图的工具（实现阶段，非本 plan 必达）。

## 8. 与配置命名对齐（建议）

| SimpleChat 配置 | 参考来源 |
| --- | --- |
| `apiBaseUrl` | SimpleExcalidraw 的 BASE_URL / Chat Completions 端点习惯；Base **不含** `/chat/completions` |
| `apiKey` | SimpleExcalidraw 设置里的 API Key（Bearer） |
| `model` | SimpleExcalidraw 模型下拉 / 字符串 ID |

对外 API 用 camelCase；文档中可同时写环境变量示例。**注意：SimpleMind 当前已移除云端 Key 配置**；接入 SimpleChat 时再决定是否恢复「Built-in + 云端」双通道。
