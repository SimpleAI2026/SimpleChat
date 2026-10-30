# AGENTS.md — SimpleChat

给 AI / 贡献者的仓库约定（中文为主，与 README 双语并存）。

## Packages

| Package | 路径 | 说明 |
| --- | --- | --- |
| `@simplechat/core` | `packages/core` | `ChatEngine`、`ChatProvider`（openai / chrome-ai）、工具注册、历史、SSE |
| `@simplechat/element` | `packages/element` | `<simple-chat>` Web Component（Shadow DOM + `--sc-*`） |
| `@simplechat/vue` | `packages/vue` | Vue 3 薄封装 `SimpleChatSidebar`（monorepo 内） |
| `@simplechat/demo` | `apps/demo` | Vite Demo |

## Yarn 命令

```bash
yarn install
yarn build                 # core → element → vue → demo
yarn test                  # core + element（门禁：通过率 ≥95%）
yarn typecheck
yarn build:min             # → dist/simplechat.min.js；默认可拷贝到兄弟仓库 SimpleMind vendor
yarn build:min --no-copy   # 只写 dist/
yarn workspace @simplechat/demo dev
```

测试门禁：**通过率 `passed / (passed + failed) ≥ 95%`**。有条件时再追求覆盖率 ≥95%。改完行为后务必跑 `yarn test`。

## Shadow DOM / 键盘约定

- UI 在 **open Shadow DOM** 内；宿主主题用 `--sc-*` / `applyThemeCss` / `theme-id`。
- **键盘隔离**：composer 与设置里的 `input` / `textarea` 在 `keydown` / `keyup` / `keypress` 上 `stopPropagation()`，避免宿主 document 监听（如 Excalidraw 快捷键）吞键。
- 保留 **Enter → 发送**、**Shift+Enter → 换行**。
- 宿主打开面板后可调用公开方法 **`focusComposer()`**。
- 可选宿主区块：`setHostSettingsSlot(el)`（例如额外说明）；内置 Nano 状态已在 Chat ⚙ 内，不必再注入同一面板。

## Provider 规则（openai vs chrome-ai）

| Provider | 用途 | 工具 `registerTool` |
| --- | --- | --- |
| `openai` | OpenAI 兼容 Chat Completions（SSE） | 支持 |
| `chrome-ai` | Chrome Prompt API / `LanguageModel` / 端侧 Gemini Nano | **不支持**（v1 跳过工具；UI 提示「工具需云端」） |

- 设置 ⚙ 内单选切换；Nano 显示状态：`unavailable` / `downloadable` / `downloading %` / `available`，并提供「重新检测」「下载模型」。
- **默认**：无 `apiKey` 且 `LanguageModel` 存在（available/downloadable）时优先 `chrome-ai`；有 Key 或显式存储则尊重选择。
- Nano 未就绪时 **阻止发送** 并给出引导文案。
- 云端仍要求 Base URL + API Key + Model。
- Chrome：**网页约 148+**，**扩展约 138+**，需启用 Prompt API / Gemini Nano。

## Vendor `build:min`

宿主（SimpleMind / SimpleExcalidraw 等）**不要** Yarn portal / npm link。改完后：

```bash
yarn build:min
# 或
yarn build:min --no-copy
```

产物：`dist/simplechat.min.js`（副作用注册 `<simple-chat>`，并导出宽度工具）。

## 中文友好

仓库 README / 注释 / UI 文案以中文为主或中英双语；新增用户可见文案优先中文。
