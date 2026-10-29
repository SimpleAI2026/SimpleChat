# 03 · 推荐架构

> 状态：待确认。确认前不写业务代码。

## 1. 总览

```
┌─────────────────────────────────────────────────────────┐
│  Host: SimpleMind (Vue) / SimpleExcalidraw / 任意页面     │
│  - 传入 config (baseURL, apiKey, model, systemPrompt)    │
│  - registerTool({ name, description, parameters, run }) │
│  - 可选 CSS 变量 / theme CSS                             │
│  - 可选 HistoryStore 注入                                │
└───────────────────────────┬─────────────────────────────┘
                            │ mount / <simple-chat>
┌───────────────────────────▼─────────────────────────────┐
│  @simpleai/simple-chat (Core)                            │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │ ChatEngine  │ │ ToolRegistry │ │ HistoryStore      │ │
│  │ stream+tools│ │ OpenAI tools │ │ IDB / host / mem  │ │
│  └──────┬──────┘ └──────┬───────┘ └─────────┬─────────┘ │
│         └───────────────┴───────────────────┘           │
│  ┌─────────────────────────────────────────────────────┐│
│  │ UI: Sidebar shell · ThreadList · Messages · Composer││
│  │ Shadow DOM + CSS variables (--sc-*)                 ││
│  └─────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS fetch SSE
                            ▼
              OpenAI-compatible /v1/chat/completions
```

**原则**：Core 框架无关；UI 用 Web Component 默认交付；Vue/React 只做薄封装。

## 2. 包装与仓库结构

建议 monorepo（也可先单包，目录预留）：

```
SimpleChat/
  plan/                 # 本目录同步过去
  packages/
    core/               # @simpleai/simple-chat-core 引擎+类型（无 UI）
    element/            # @simpleai/simple-chat  Web Component + 默认 UI
    vue/                # @simpleai/simple-chat-vue  （SimpleMind 优先）
    react/              # @simpleai/simple-chat-react （可选，后期）
  apps/
    demo/               # Vite 静态 Demo：配置面板 + 侧栏 + 示例工具
  README.md
  LICENSE               # 建议 MIT
```

发布：

| 包 | 给谁用 |
| --- | --- |
| `@simpleai/simple-chat` | script / 任意框架：注册 `<simple-chat>` |
| `@simpleai/simple-chat-vue` | SimpleMind |
| `@simpleai/simple-chat-react` | SimpleExcalidraw 若继续 React |
| `@simpleai/simple-chat-core` | 只要引擎不要默认 UI 的进阶用户 |

包名以你确认的 npm scope 为准（`@simpleai/*` 或 `@simplechat/*`）。

## 3. 嵌入 API 草图

### 3.1 Web Component

```html
<script type="module" src="https://cdn.example.com/simple-chat.js"></script>
<simple-chat
  api-base-url="https://api.siliconflow.cn/v1"
  model="Qwen/Qwen3.8-27B"
  storage-key="simplemind-map-1"
  position="right"
  open
></simple-chat>
<script type="module">
  const el = document.querySelector('simple-chat');
  el.apiKey = 'sk-...'; // 属性可写，也支持 property
  el.systemPrompt = '你是思维导图助手…';
  el.registerTool({
    name: 'add_child_nodes',
    description: '在当前选中节点下添加子节点',
    parameters: {
      type: 'object',
      properties: {
        titles: { type: 'array', items: { type: 'string' } }
      },
      required: ['titles']
    },
    handler: async ({ titles }) => {
      // 宿主逻辑
      return { ok: true, count: titles.length };
    }
  });
</script>
```

### 3.2 Vue（SimpleMind）

```ts
import { SimpleChatSidebar } from '@simpleai/simple-chat-vue';

// template
// <SimpleChatSidebar
//   v-model:open="chatOpen"
//   :config="aiConfig"
//   :tools="mindTools"
//   storage-key="sm-chat"
//   class="my-theme"
// />
```

### 3.3 命令式 Core（无 UI）

```ts
import { createChatClient } from '@simpleai/simple-chat-core';

const client = createChatClient({
  apiBaseUrl,
  apiKey,
  model,
  systemPrompt,
  store: indexedDbStore('sm-chat'),
});
client.tools.register(toolDef);
for await (const ev of client.send('帮我扩展这个节点')) {
  // ev: text-delta | tool-call | tool-result | done | error
}
```

## 4. 配置模型

```ts
interface SimpleChatConfig {
  apiBaseUrl: string;   // 不含 /chat/completions，勿尾斜杠优先
  apiKey: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** 额外请求头，如某些网关要的 */
  headers?: Record<string, string>;
  /** 生产可选：只请求同源代理，忽略浏览器内 apiKey */
  proxyUrl?: string;
}
```

请求构造（OpenAI Chat Completions 兼容）：

```
POST {apiBaseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "...",
  "messages": [ ...system?, ...history, ... ],
  "stream": true,
  "tools": [ ...registered ],   // 有工具时
  "tool_choice": "auto"
}
```

## 5. 历史与数据模型

### 5.1 实体

```ts
interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>; // 如 { mapId, sceneId }
}

type Role = 'system' | 'user' | 'assistant' | 'tool';

interface ChatMessage {
  id: string;
  threadId: string;
  role: Role;
  content: string;              // assistant 可在流式中增长
  toolCallId?: string;          // role=tool
  toolCalls?: ToolCall[];       // role=assistant 且发起调用
  createdAt: number;
  status?: 'streaming' | 'done' | 'error';
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string，与 OpenAI 对齐
}
```

### 5.2 存储适配器

```ts
interface HistoryStore {
  listThreads(): Promise<ChatThread[]>;
  getMessages(threadId: string): Promise<ChatMessage[]>;
  upsertThread(t: ChatThread): Promise<void>;
  appendMessage(m: ChatMessage): Promise<void>;
  updateMessage(m: ChatMessage): Promise<void>;
  deleteThread(id: string): Promise<void>;
  clearAll?(): Promise<void>;
}
```

默认实现优先级：

1. **IndexedDB**（消息可能较长，优于 localStorage 配额）  
2. 回退 **localStorage**（小 Demo）  
3. **MemoryStore**（测试）  
4. **HostStore**：宿主实现接口（例如按导图文件存）

`storageKey` / `dbName` 隔离多实例（同页多个侧栏或不同宿主文档）。

### 5.3 送入模型的 messages

- 带上当前 thread 的 user/assistant/tool 消息（可配置 `maxMessages` 截断）。  
- `system` 每轮由 config.systemPrompt 注入，不一定落库（或落库为 thread 级）。  
- 工具循环中途的 tool 消息必须保留在上下文中，否则模型无法继续。

## 6. 插件主题 / CSS

### 6.1 CSS 变量（建议）

**默认主题：shadcn/ui 风格黑白**（完整 ASCII 视图与 token 见 [`06-ui-views.md`](./06-ui-views.md)）。默认 **不** 使用蓝色 accent。

```css
simple-chat, .simple-chat-host {
  --sc-background: #ffffff;
  --sc-foreground: #0a0a0a;
  --sc-muted: #737373;
  --sc-muted-bg: #f5f5f5;
  --sc-border: #e5e5e5;
  --sc-primary: #171717;
  --sc-primary-fg: #fafafa;
  --sc-assistant-bg: #ffffff;
  --sc-assistant-border: #e5e5e5;
  --sc-ring: #0a0a0a;
  --sc-radius: 10px;
  --sc-radius-sm: 8px;
  --sc-radius-lg: 12px;
  --sc-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --sc-font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --sc-width: 420px;
  --sc-pad: 20px;
  --sc-gap: 16px;
  --sc-space-1: 4px;
  --sc-space-2: 8px;
  --sc-space-3: 12px;
  --sc-space-4: 16px;
  --sc-space-5: 20px;
  --sc-space-6: 24px;
  --sc-header-height: 56px;
  --sc-icon-size: 36px;
  --sc-z-index: 1000;
}
```

### 6.2 注入方式

1. **CSS 变量**（首选）  
2. `themeCss: string` —— 注入到 Shadow Root 的 `<style>`  
3. `className` / part 暴露（若不用 Shadow DOM 的 Vue 模式可用 `:deep`）

默认 **Shadow DOM**（Web Component）隔离宿主 Ant Design / Excalidraw 样式。Vue 适配器可选「非 Shadow、用 scoped + 变量」，方便与 Ant Design Vue 视觉统一。

## 7. 宿主工具桥（核心）

### 7.1 注册

```ts
interface HostTool {
  name: string;                 // ^[a-zA-Z0-9_-]+$
  description: string;
  parameters: object;           // JSON Schema object
  handler: (args: any, ctx: ToolContext) => Promise<unknown> | unknown;
}

interface ToolContext {
  threadId: string;
  abortSignal: AbortSignal;
}
```

- 重复 `name`：后注册覆盖并 `console.warn`（对齐 CopilotKit 行为直觉）。  
- 卸载时 `unregisterTool(name)` 或组件 unmount 自动清理。

### 7.2 运行时循环（伪代码）

```
messages = loadThread()
append user message
loop:
  stream chat.completions(messages, tools=registry.toOpenAI())
  if finish_reason == tool_calls:
    append assistant message with tool_calls
    for each call:
      result = await registry.run(call)
      append { role: tool, tool_call_id, content: json(result) }
    continue
  else:
    append/finalize assistant text
    break
persist
```

安全闸门：

- `maxToolRounds`（默认 5）防止死循环  
- 单次 handler 超时  
- handler 抛错 → 把错误字符串作为 tool 结果回灌，让模型解释，而不是静默失败  
- UI 展示 tool 卡片（pending / done / error）

### 7.3 与兄弟项目的映射示例

| 宿主 | 工具示例 | handler 作用 |
| --- | --- | --- |
| SimpleMind | `add_child_nodes` | 对选中节点插入子节点 |
| SimpleMind | `get_selected_node` | 返回当前节点文本给模型 |
| SimpleExcalidraw | `create_elements` | 往画布加形状 |
| SimpleExcalidraw | `get_canvas_summary` | 只读上下文 |

聊天层 **不** 懂导图/画布；只懂 tools。

## 8. 流式实现

- 使用 `fetch` + `ReadableStream` 解析 SSE：`data: {...}` / `[DONE]`。  
- 兼容常见字段：`choices[0].delta.content`、`delta.tool_calls` 增量合并。  
- 部分国产网关带 `reasoning_content`：MVP 可忽略或折叠显示（Should）。  
- `AbortController` 支撑「停止生成」。

## 9. UI 信息架构（侧栏）

视觉与多状态 ASCII **以 [`06-ui-views.md`](./06-ui-views.md) 为准**。结构摘要：

```
┌─ Header: SimpleChat | 新会话 | 历史 | 关闭 ─┐
│ ThreadList（抽屉）                           │
│ ┌─ Messages ──────────────────────────────┐ │
│ │ user（右・深色） / assistant（左・描边）  │ │
│ │ tool card（等宽・状态）                   │ │
│ └─────────────────────────────────────────┘ │
│ Composer: textarea + 发送/停止 + 快捷键 hint │
└─────────────────────────────────────────────┘
```

默认皮肤：**shadcn 黑白**，边框优先于阴影，圆角 6–8px。  
默认 `position: fixed; inset-block: 0; inline-end: 0; width: var(--sc-width)`。宿主也可 `layout="panel"` 渲染进自己的抽屉容器（只输出内容区）。

## 10. 安全说明（apiKey 在浏览器）

| 风险 | 缓解 |
| --- | --- |
| Key 被用户或 XSS 窃取 | 文档强调：**仅个人/内网 Demo**；生产用 `proxyUrl` 同源代理 |
| Key 进 localStorage | Core **默认不强制持久化**；产品允许可选「记住 Key」（见开放问题 9B），须加密或至少隔离 storageKey，并在 UI 明示风险 |
| 恶意网页嵌入你的 bundle 盗用 | 无解于纯前端 Key；代理 + 用户登录才是正途 |
| 工具 handler 权限过大 | 宿主只注册最小权限工具；危险操作要 UI 确认（后期 human-in-the-loop） |
| Markdown XSS | 渲染前消毒 / 用安全 markdown 库；Shadow DOM 降低样式风险，不等于脚本安全 |
| CORS | 文档列出需网关允许浏览器 Origin；否则必须代理 |

MVP 接受与 SimpleMind 相同的「浏览器持 Key」模型，但 README 必须有醒目警告与代理模式路线图。

## 11. 技术选型建议（待确认）

| 项 | 建议 | 备选 |
| --- | --- | --- |
| 语言 | TypeScript | — |
| 构建 | Vite + 库模式（多入口） | tsdown/unbuild |
| UI | 自研轻量 DOM + CSS variables | Lit（Web Component） |
| Markdown | `marked` + 消毒 | `markdown-it` |
| 测试 | Vitest（对齐 SimpleMind） | — |
| Demo | Vite + Vue 或纯 HTML | — |

**不**把 CopilotKit / assistant-ui / AI SDK 设为 peer 硬依赖。

## 12. 架构决策记录（ADR 摘要）

1. **Build not Fork** —— 见 `02`。  
2. **OpenAI Chat Completions + tools 为唯一协议** —— 覆盖国内兼容网关。  
3. **Web Component 为规范嵌入面** —— Vue/React 为糖。  
4. **IndexedDB 默认历史** —— 宿主可替换。  
5. **工具在浏览器执行** —— 满足「接入方注册 API」；服务端工具后期用 proxy 扩展。
