# SimpleChat 规划文档索引

> 状态：**开放问题已确认**（2026-10-29）；待最终确认后进入 Phase 0  
> 目标仓库：`/Volumes/my/github/SimpleChat`（当前为空壳）  
> 兄弟项目： [SimpleMind](https://github.com/SimpleAI2026/SimpleMind) · [SimpleExcalidraw](https://github.com/SimpleAI2026/SimpleExcalidraw)

SimpleMind / SimpleExcalidraw 已有「点一下让 AI 做事」的能力，但 **聊天弱、不记历史、不可复用**。SimpleChat 要做成可被侧边栏嵌入的 **纯前端 OpenAI 兼容聊天层**，并让宿主把 API/工具注册进来，供模型调用。

## 一页结论

| 决策项 | 建议 |
| --- | --- |
| 从零做 vs Fork | **从零做轻量 SDK**；不 Fork LibreChat / Open WebUI / LobeChat（过重、非 embed SDK） |
| 最值得借鉴 | **CopilotKit**（侧栏 + 宿主注册前端工具）、**assistant-ui**（消息/工具 UI 原语）、**Neiki Assistant**（Web Component + CSS 变量 + localStorage 历史） |
| 嵌入形态 | **框架无关 Core + Vue/React 适配 + `<simple-chat>` Web Component**（SimpleMind 是 Vue3，优先 Vue 适配） |
| 配置 | `apiBaseUrl` / `apiKey` / `model` / `systemPrompt`（面向 OpenAI 兼容网关；SimpleExcalidraw 已有 BASE_URL/API Key，SimpleMind 现为 Built-in AI（云端变量已移除）） |
| 历史 | 默认 IndexedDB；可注入宿主 Store |
| 工具桥 | 宿主 `registerTool` → OpenAI `tools` → 浏览器执行 handler → 回灌 messages 再请求 |
| 默认 UI | **shadcn 黑白**：细边框、8px 圆角、用户深色气泡 / 助手描边气泡；ASCII 见 `06` |

## 文档列表

| 文件 | 主题 | 状态 |
| --- | --- | --- |
| [01-requirements.md](./01-requirements.md) | 需求澄清、非目标、与兄弟项目关系 | 待确认 |
| [02-market-research.md](./02-market-research.md) | 市场/GitHub 竞品对比（约 12 个）与选型 | 已调研 |
| [03-architecture.md](./03-architecture.md) | 包结构、嵌入 API、历史模型、工具桥、安全 | 待确认 |
| [04-implementation-plan.md](./04-implementation-plan.md) | 分阶段里程碑、风险、待你拍板的问题 | 待确认 |
| [05-references.md](./05-references.md) | 仓库与文档链接 | 已整理 |
| [06-ui-views.md](./06-ui-views.md) | ASCII 布局视图 + shadcn 黑白视觉规范 | **已补充** |

建议阅读顺序：`01` → `02` → `03` → `06`（视图）→ `04`；开放问题已确认（见 `04` §7）。

## 成功标准（本 plan 目录）

- [x] 六个 markdown 文件齐全
- [x] 覆盖多个真实项目并附可核验 URL
- [x] 给出明确「从零做」建议与分阶段计划
- [ ] 用户确认后再开始写 SimpleChat 代码
