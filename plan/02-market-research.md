# 02 · 市场与 GitHub 竞品调研

> 调研日：2026-10-29（Asia/Shanghai）  
> 星标为当时近似值；以「是否贴合 SimpleChat 目标」为主，不以星标排名。

## 1. SimpleChat 选型坐标

必须同时满足（或接近）：

1. **可嵌入侧栏**（不是整站 ChatGPT 克隆）
2. **纯前端**：`apiBaseUrl` + `apiKey` + `model`
3. **历史会话**可持久化
4. **宿主注册工具/API**，模型经 function calling 调用
5. **主题可 CSS 注入**
6. 最好 **框架无关或易接 Vue**（SimpleMind = Vue3）

多数明星项目只覆盖其中 1–2 条。

## 2. 分层对照

| 层 | 代表 | 对 SimpleChat 的意义 |
| --- | --- | --- |
| 传输/状态 | Vercel AI SDK (`useChat`) | 可参考流式与消息状态；默认常配后端 route，**不是**侧栏产品 |
| 聊天 UI 原语 | assistant-ui | Thread/Message/Tool UI 优秀；**React + 常需 runtime** |
| 应用内 Agent | CopilotKit | **侧栏 + useFrontendTool 几乎就是产品形态**；但需 runtimeUrl，偏重，React 优先 |
| 全站 Chat 产品 | LibreChat / Open WebUI / LobeChat / Chatbot UI | 功能全、**过重**，不适合当 embed SDK |
| 轻量 Widget | Neiki / ChatCops / Open Chat Widget | 嵌入姿势对；多数**密钥走后端**或成熟度低 |
| 纯前端客户端 | Air Agent / HTML Chat / Aether / HYOAI | 配置与流式/工具可抄；**不是可复用 sidebar SDK** |

## 3. 候选对比表（约 12 个）

评分相对 SimpleChat 目标：`●` 强 / `◐` 部分 / `○` 弱或相反。

| 项目 | Stars≈ | License | 纯前端直连 | 历史 | 主题/CSS | 宿主工具 | 嵌入模型 | OpenAI 兼容 | 成熟度 | 贴合度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **CopilotKit** | 38k | MIT | ○（要 runtime） | ● | ◐ | **●** `useFrontendTool` | React 侧栏组件 | ◐（经 runtime） | 高 | 形态最像，架构偏重 |
| **assistant-ui** | 12.8k | MIT | ○（默认 AI SDK 后端） | ● | ● 可组合 | ● Generative UI | React npm | ◐ | 高 | UI 可借鉴，非 Vue/纯前端 |
| **Vercel AI SDK** | 27.6k | Apache-ish | ◐（可自写 transport） | ○（自管） | ○ headless | ◐ tools | hooks | ● | 很高 | 适合当依赖，不是产品 |
| **vercel/ai-chatbot** | 21k | 见仓库 | ○ Next 全栈 | ● | ◐ | ◐ | 应用模板 | ● | 高 | 模板，非 SDK |
| **LibreChat** | 46k | MIT | ○ 要后端 | ● | ◐ | ● Agents/MCP | 整站 | ● 多厂商 | 很高 | **过重** |
| **Open WebUI** | 157k | 自定义/偏 GPL 系 | ○ | ● | ● | ● | 整站 | ● | 很高 | **过重 + 许可谨慎** |
| **LobeChat/LobeHub** | 83k | **Community（衍生需商用许可）** | ○ | ● | ● | ● 插件 | 整站 | ● | 很高 | **不宜 fork** |
| **Chatbot UI** | 33k | MIT | ○ | ● | ◐ | ○ | 整站 | ● | 中（大更新中） | 非 embed |
| **OpenAI ChatKit** | 2k (js) | Apache-2.0 | ○ 要服务端 | ● | ● | ● | Web Component / React | OpenAI 生态 | 中高 | 绑 OpenAI 栈，非「自带 Key 纯前端」 |
| **Neiki Assistant** | ~1 | MIT | ○（强制自己的 `/api`） | ● localStorage | **●** CSS 变量 + Shadow DOM | ○ | **●** `<neiki-assistant>` | 经后端 | 低 | **嵌入/主题姿势最可抄** |
| **ChatCops** | ~15 | MIT | ◐ | ◐ | ◐ | ○ | script 标签 | ● 多厂商 | 低 | 轻量参考 |
| **Open Chat Widget** | ~18 | MIT | ○ 要 streaming endpoint | ◐ | ◐ | ◐ MCP/工具渲染 | React SDK 等 | 经 AI SDK 后端 | 低 | 「你建后端、它管 UI」 |
| **ai-chat-widget** (gmen1057) | ~37 | MIT | ○ Docker/Python 后端 | ● | data-primary-color | ○ | script | ● | 低 | 需后端 |
| **Air Agent / HTML Chat** 等 | &lt;10 | 各异 | **●** | ● | ◐ | ●（页内工具） | 整页应用 | ● | 低 | **协议与工具循环可抄** |

补充纯前端客户端（未全部列入上表）：[Air Agent](https://github.com/Thelia-Lzr/air-agent)、[HTML Chat](https://github.com/Cxmrykk/html-chat)、[Aether](https://github.com/farrysewon/aether)、[HYOAI](https://github.com/zenetys/hyoai)、[Chit](https://github.com/Fortyseven/chit-v2) —— 共同点是浏览器直连 OpenAI 兼容端 + 本地存储；共同点是 **不是给别人 embed 的包**。

## 4. 逐项要点（强相关）

### 4.1 CopilotKit — 产品形态标杆

- 现成 [`CopilotSidebar`](https://docs.copilotkit.ai/prebuilt-components/sidebar)：可折叠侧栏聊天。
- [`useFrontendTool`](https://docs.copilotkit.ai/reference/v2/hooks/useFrontendTool)：宿主在浏览器注册工具，Agent 调用时执行 handler，并可 render 工具 UI —— **与需求 4 几乎同构**。
- 代价：需要 `runtimeUrl`、偏 React/Agent 全家桶，**不是**「三项配置纯前端」。
- **结论**：学 API 形状（sidebar + registerTool），**不要**整仓依赖或 fork。

### 4.2 assistant-ui — UI 原语标杆

- Thread / Message / Composer / 工具调用展示成熟；常搭 Vercel AI SDK。
- React + shadcn 风格；SimpleMind 是 Vue，直接用成本高。
- **结论**：消息列表、流式、tool call 卡片可对照设计；实现自研。

### 4.3 Vercel AI SDK / ai-chatbot

- `useChat` 管流式与 messages；UI 自建或叠 assistant-ui。
- 官方路径是 Next route 持有密钥；浏览器直连要自写 transport，且仍缺「侧栏 SDK + 宿主工具注册」产品层。
- **结论**：可选作内部依赖，**不可替代 SimpleChat 产品边界**。

### 4.4 LibreChat / Open WebUI / LobeChat / Chatbot UI

- 星标高、能力全（多用户、RAG、MCP、Artifacts…）。
- 定位是 **可自托管的 Chat 产品**，不是 10–50KB 级 embed 库。
- LobeChat 许可证对 **衍生作品** 有额外商用限制，开源兄弟项目不宜以 fork 为基座。
- **结论**：明确非目标；文档里写「我们更轻」即可。

### 4.5 OpenAI ChatKit

- 高质量 embed + Web Component；工具与流式完善。
- 依赖 OpenAI 侧服务端/ChatKit 后端模型，与「用户自备任意兼容 Base URL + Key」冲突。
- **结论**：交互可参考，栈不采用。

### 4.6 Neiki Assistant — 嵌入姿势标杆

- 零依赖 Web Component、Shadow DOM、CSS 变量主题、localStorage 多会话历史、script 一行接入。
- **故意不**在浏览器持有 Provider Key，只 POST 到宿主 `api`。
- 无宿主 function-calling 工具注册。
- **结论**：打包与主题隔离照抄思路；协议改成「可直连 OpenAI 兼容 + tools」。

### 4.7 其它 Widget（ChatCops / Open Chat Widget / ai-chat-widget）

- 证明「script 标签侧栏」有需求；星标低、文档/工具桥不完整或强制后端。
- **结论**：验证市场空隙——**轻量 + 纯前端 Key + 宿主工具** 组合仍稀缺。

### 4.8 中文生态

- 国内大量「ChatGPT 克隆」与 LobeChat / Open WebUI 中文社区，**少见**「给思维导图/白板嵌侧栏 + registerTool」的 MIT 小库。
- SimpleExcalidraw 等已对接 OpenAI 兼容网关；SimpleChat 坚持兼容协议即可覆盖中文模型生态，不必接各厂商私有 SDK。

## 5. 差距总结：市场空白

| 能力 | 重型 Chat 应用 | CopilotKit 类 | 轻量 Widget | **SimpleChat 目标** |
| --- | --- | --- | --- | --- |
| 侧栏 embed | ○ | ● | ● | ● |
| 浏览器三项配置直连 | ○ | ○ | ○/◐ | ● |
| 多会话历史 | ● | ● | ●/◐ | ● |
| 宿主 registerTool | ◐/●（服务端） | ● | ○ | ●（浏览器） |
| Vue / 框架无关 | ○ | ○ | ● | ● |
| MIT、可 fork 进兄弟仓库 | 视项目 | ● | ● | ● |

**空白点**正是 SimpleChat 的存在理由。

## 6. 建议：从零实现，而不是 Fork

### 推荐：**从零做轻量 SDK（Build）**

理由：

1. 目标是 **可嵌入库**，不是再造 Chat 站点；Fork LibreChat/Open WebUI/LobeChat 会背负认证、DB、RAG、部署，与「纯前端」相反。  
2. CopilotKit / assistant-ui **理念最贴**，但 React+runtime 与 Vue 宿主、三项配置直连冲突；「依赖整套」会绑架兄弟项目技术栈。  
3. Neiki 等 Widget 太薄（无 tools、且强制后端），Fork 后仍要重写协议层，收益不如自控 Core。  
4. 纯前端客户端（Air Agent / HTML Chat）验证了 **tools 循环 + IndexedDB/localStorage** 可行，但无可复用 embed API——应 **抽取模式重写**，而非维护他人整页应用。  
5. 与 SimpleExcalidraw 一类配置约定对齐、包体可控、MIT 清晰，长期维护成本更低。

### 不推荐

| 路径 | 原因 |
| --- | --- |
| Fork LobeChat | 许可证限制衍生；单体过大 |
| Fork LibreChat / Open WebUI | 后端+多用户；嵌入成本极高 |
| 直接 npm 依赖 CopilotKit 作为 SimpleChat | 违背纯前端与 Vue 优先；用户还要架 runtime |
| 只贴一个 iframe 指向公共 Chat 站 | 无法 registerTool、主题与历史难统一 |

### 「借鉴清单」（合法对照，不复制大段代码）

1. CopilotKit：侧栏交互 + `registerTool`/`useFrontendTool` 生命周期  
2. assistant-ui：消息部件与 tool call 展示信息架构  
3. Neiki：Web Component、Shadow DOM、CSS 变量、storageKey  
4. OpenAI 兼容：`apiBase` 不含 `/chat/completions`、Bearer、国内兼容网关（SimpleExcalidraw 已有实践）  
5. OpenAI tools 协议：标准 `tools` / `tool_calls` / `role: tool`

## 7. 可选依赖策略（实现时再定）

- **MVP 零或极少依赖**：`fetch` + 自研 SSE 解析 + 轻量 markdown（或 `marked`/`markdown-it`）。  
- **可选**：Vue/React 薄适配包。  
- **不默认**捆绑 Vercel AI SDK / CopilotKit（可作为高级示例，非核心）。
