# SimpleChat

纯前端、可嵌入的 **OpenAI 兼容** 侧栏聊天 SDK。宿主传入 `apiBaseUrl` / `apiKey` / `model`，并可 `registerTool` 让模型调用浏览器内宿主 API。默认 UI 为 shadcn 风格黑白主题。

> 规划文档见 [`plan/`](./plan/)。本仓库实现 Phase P0–P4（Core / Web Component / Vue 薄封装 / Demo）。**不**包含 SimpleMind / SimpleExcalidraw 接入。

## Packages

| Package | 说明 |
| --- | --- |
| `@simplechat/core` | `ChatEngine`、工具注册、IndexedDB / Memory 历史、SSE 流式 |
| `@simplechat/element` | `<simple-chat>` Web Component（Shadow DOM + `--sc-*`） |
| `@simplechat/vue` | Vue 3 薄封装 `SimpleChatSidebar` |
| `@simplechat/demo` | Vite Demo：配置面板 + 侧栏 + 示例工具 |

## Quick start

> Packages publish from `packages/*/dist`. After clone: `yarn install && yarn build` before linking or portal into a host (e.g. SimpleMind).


```bash
yarn install
yarn workspace @simplechat/core test
yarn workspace @simplechat/demo dev
```

打开终端提示的本地地址，填写：

- **API Base URL**（例如 `https://api.openai.com/v1` 或 SiliconFlow）— **不要**带 `/chat/completions`
- **API Key**
- **Model**

也可点击侧栏右上角 **⚙ 设置** 在组件内配置（推荐宿主如 SimpleMind 依赖此入口）。

可选勾选「记住 API Key」将 Key 存入 localStorage（有 XSS 泄露风险）。

若配置了环境变量（或 Vite `VITE_*`），空表单/设置会自动预填：

| 用途 | 接受的变量名（任一） |
| --- | --- |
| Base URL | `OPENAI_BASE_URL`、`OPENAI_BASEURL`、`VITE_OPENAI_BASE_URL`、`VITE_OPENAI_BASEURL` |
| API Key | `OPENAI_API_KEY`、`OPENAI_KEY`、`VITE_OPENAI_API_KEY`、`VITE_OPENAI_KEY` |
| Model | `OPENAI_MODEL`、`MODEL`、`VITE_OPENAI_MODEL`、`VITE_MODEL` |

示例：在 `apps/demo/.env` 写入 `VITE_OPENAI_BASE_URL=…` 后执行 `yarn dev`。

示例工具：`get_page_title`、`alert_message`、`propose_style_css`（AI 只把 CSS 写入左侧输入框，需用户点「应用配置」才生效）。

## Embed

### Web Component

```html
<script type="module">
  import '@simplechat/element';
  const el = document.querySelector('simple-chat');
  el.apiKey = 'sk-…';
  el.registerTool({
    name: 'get_page_title',
    description: 'Get document title',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ title: document.title }),
  });
</script>
<simple-chat
  api-base-url="https://api.openai.com/v1"
  model="gpt-4o-mini"
  storage-key="my-app"
  layout="sidebar"
  open
></simple-chat>
```

### Vue 3

```vue
<script setup>
import { SimpleChatSidebar } from '@simplechat/vue';
</script>
<template>
  <SimpleChatSidebar
    v-model:open="open"
    :config="{ apiBaseUrl, apiKey, model }"
    :tools="tools"
    storage-key="sm-chat"
  />
</template>
```

## Config

| 字段 | 说明 |
| --- | --- |
| `apiBaseUrl` | OpenAI 兼容根路径，**不含** `/chat/completions` |
| `apiKey` | `Authorization: Bearer …` |
| `model` | 模型 ID |
| `systemPrompt` | 可选 |
| `storageKey` | IndexedDB 与设置 localStorage 命名空间 |

请求实际发往：`POST {apiBaseUrl}/chat/completions`。

### 配置优先级

1. 宿主显式传入的非空 props / attrs / `setConfig`
2. localStorage（`${storageKey}:settings`：始终存 Base URL / Model / 系统提示词 / `themeId` / 工具样式 / `rememberKey`；仅在勾选「记住 API Key」时存 Key）
3. 环境变量（`readEnvDefaults()`，见上表；不含 systemPrompt）
4. 空

`<simple-chat>` 右上角 ⚙ 打开设置面板（含 **系统提示词**）；**保存**后写入 localStorage 并 `updateConfig`，无需刷新。取消或再次点 ⚙ 关闭且不应用未保存编辑。

### 系统提示词写入接口

| 方式 | 用法 |
| --- | --- |
| Vue prop | `:config="{ systemPrompt: '…' }"` |
| WC 属性 | `system-prompt="…"` |
| WC 属性访问器 | `el.systemPrompt = '…'` |
| `setConfig` | `el.setConfig({ systemPrompt: '…' })` |
| 面板设置 | ⚙ → 系统提示词 → 保存（会发 `sc-settings`，detail 含 `systemPrompt`） |

宿主非空值优先于 localStorage。

## Theme

内置 **10** 套命名主题（`listThemes()` / `getThemeCss(id)`）：

| id | 标签 |
| --- | --- |
| `bw` | 黑白（默认） |
| `minimal` | 简洁 |
| `ink` | 墨色 |
| `ocean` | 海洋 |
| `forest` | 森林 |
| `sunset` | 日落 |
| `violet` | 紫罗兰 |
| `warmpaper` | 暖纸 |
| `contrast` | 高对比 |
| `terminal` | 终端 |

```vue
<SimpleChatSidebar theme-id="ocean" />
```

```js
el.setTheme('terminal')
// 或
el.themeId = 'violet'
```

优先级：宿主 `themeCss` / `themeStyle`（最高）→ 宿主 `themeId` → localStorage `themeId` → `bw`。

右侧 ⚙ 还可改 **工具样式**（`--sc-tool-bg` / border / radius / font-size），与主题一并持久化。

Shadow DOM **不会**继承父节点 CSS 变量；额外覆盖请用：

```vue
<SimpleChatSidebar
  theme-id="bw"
  :theme-style="{ '--sc-primary': '#2563eb' }"
  :theme-css="':host { --sc-tool-bg: #eef2ff; }'"
/>
```

## Security

浏览器内持有 API Key **仅适合个人/内网 Demo**。生产请使用同源代理（`proxyUrl` 路线图，见 plan P6）。勾选「记住 API Key」（Demo 表单或组件内设置）会写入 localStorage，存在 XSS 泄露风险。

## License

MIT — see [LICENSE](./LICENSE).
