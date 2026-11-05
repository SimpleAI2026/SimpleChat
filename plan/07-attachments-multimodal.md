
## 已决议（2026-11-05，用户确认）

1. **范围：** v1 仅 `image/*`；非图片 UI `accept="image/*"` 拒绝并提示。
2. **多文件：** 最多 **5**；单文件 **4MB**。
3. **仅图：** 允许；占位 `content` / text part 用 `[image]`（有文件名时摘要可用文件名）。
4. **持久化：** Phase A 可把 base64 写入消息 JSON；**不升** IDB version（仍为 1）。Phase B 再独立 Blob store。
5. **chrome-ai：** Phase A 遇图拦截并提示改云端（不做 Phase C）。
6. **API：** 主推 `setUploadHandler`；同义 `hooks.upload` / `onUploadFile`。
7. **detail：** 默认 `auto`。
8. **宿主：** `yarn build:min` 更新 Mind/Excalidraw vendor；wrapper 不深改，后续自行 `setUploadHandler`。

**状态：** Phase A 已实现（编码完成）。

---

# 07 — 对话附件 / 图片多模态（调查结论 + 实现方案）

> **状态：** Phase A 已确认并实现（见下方「已决议」）。  
> **调查日期：** 2026-11-05（Asia/Shanghai）  
> **当前版本：** 仓库根 / 扩展 `0.1.2`；`@simplechat/*` packages `0.1.0`  
> **需求出处：** `plan/01-requirements.md` §4 Could —「附件 / 图片多模态」

---

## 1. 现状结论（Investigate）

### 1.1 Composer / 输入 UI

| 项 | 现状 |
| --- | --- |
| 位置 | `packages/element/src/SimpleChatElement.ts` → `.sc-composer` / `.sc-composer-card` |
| 控件 | 仅 `<textarea>` + 「发送」；footer 左侧 hint「Enter 发送 · Shift+Enter 换行」 |
| 发送 | `handleSend()`：`textarea.value.trim()` → `engine.send(text)`；**空文本直接 return** |
| 附件 UI | **无** paperclip / file input / drag-drop / paste / preview chip |
| 键盘 | composer `stopPropagation`；`focusComposer()` 已公开 |
| 消息渲染 | user：`escapeHtml(m.content)` 纯文本；assistant：`renderMarkdown`；**无图片气泡** |

### 1.2 消息类型 / OpenAI 多模态

| 层 | 现状 |
| --- | --- |
| `ChatMessage` | `content: string` only（`packages/core/src/types.ts`） |
| `OpenAICompatMessage` | `content: string` only（`providers/types.ts`） |
| `ChatEngine.send(userText: string)` | 仅字符串；`toOpenAIMessages` 原样塞 string |
| `OpenAICompatProvider` | `messages` JSON 直传；**已可吃** `content: ContentPart[]`（若上游改类型） |
| `ChromeAiProvider` | `messagesToPrompt` **强制 string flatten**；session 未设 `expectedInputs: image` |

### 1.3 公开 API / 扩展点模式

已有模式是 **元素实例方法 + CustomEvent**，不是 React hooks：

- 方法：`setConfig` / `registerTool` / `setHostSettingsSlot` / `focusComposer` / `applyThemeCss` / `setTheme` / `setWidth` …
- 事件：`sc-close` / `sc-resize` / `sc-settings`（`bubbles` + `composed`）
- Vue：`expose({ setHostSettingsSlot, … })`；SimpleMind / SimpleExcalidraw 各自 vendor wrapper 同样 expose

**附件上传应对齐此模式：**  
`el.setUploadHandler(fn)` 或 `el.hooks = { upload: fn }`，并可选事件 `sc-upload-error`；Vue/宿主 wrapper 再 expose 同名方法。

### 1.4 Chrome 扩展 vs 嵌入 SDK（选文件）

| | 扩展 `layout="extension"` | 嵌入（SimpleMind / SimpleExcalidraw / demo） |
| --- | --- | --- |
| 选文件 | 扩展页内 `<input type=file>` 即可；manifest **无需** 额外 file 权限 | Shadow DOM 内同样可用 |
| paste / drag-drop | 均可；注意 isolation 不要挡住 paste | Excalidraw 宿主需确认 paste 不与画布抢事件（已有 keyboard isolation，paste 需单独 `stopPropagation`） |
| object URL | 同源可用；刷新后失效 | 同左 |
| 持久化 | IndexedDB 在 `chrome-extension://` origin | IndexedDB 在宿主 origin；`storage-key` 隔离 |

### 1.5 IndexedDB / 持久化

- `IndexedDBStore`：`DB_VERSION = 1`；`messages` 存整条 `ChatMessage`（含 `content` string）
- **可以**把 base64 data URL 写进 `content` / 新字段，但会快速撑爆配额、拖慢 `getAll`
- **建议：** 消息里只持久化「可恢复引用」（http(s) URL、host `id`、或独立 `attachments` objectStore 存 Blob）；默认无 hook 的 blob: URL **不**写入历史（或仅会话内预览）

### 1.6 宿主影响（vendor min.js）

- `yarn build:min` → `dist/simplechat.min.js` 并默认拷到  
  `../SimpleMind/src/vendor/simplechat/`、`../SimpleExcalidraw/src/vendor/simplechat/`
- 宿主当前 **未** 接 chat 附件；各自另有「上传 .md/.txt/.csv/.pdf」给旧 AI（Excalidraw `UPLOAD_MAX_BYTES = 2MB`）
- **向后兼容：** 不加附件时行为不变；新 API 均为可选。宿主若要用上传，需在 wrapper 里 `setUploadHandler` 并重建 vendor

### 1.7 Nano / chrome-ai

- **当前代码：无 vision**（纯文本 prompt）
- **平台能力（2026）：** Chrome Prompt API 在 **148+** 支持 `expectedInputs: [{type:'image'}]`，可传 `Blob` 等；扩展侧文本 Nano 约 138+，多模态能力以 `LanguageModel.availability({ expectedInputs:[{type:'image'}] })` 为准
- **方案建议：** v1 附件以 **openai 云端 vision** 为主；chrome-ai 若带图则：检测 multimodal availability → 支持则走 Blob parts，否则 toast「端侧暂不支持图片，请改用云端」并阻止发送（与现有 Nano 未就绪拦截同构）

---

## 2. 目标 UX（确认后实现）

1. **纸夹按钮**（composer footer 左侧，hint 旁）：打开隐藏 `<input type="file" multiple accept="…">`
2. **拖拽**：拖到 `.sc-composer-card` 高亮；松开加入队列
3. **粘贴**：composer 聚焦时 `paste` 取 `clipboardData.files` / image items
4. **预览 chips**：缩略图（image）或文件名+大小（非图）；每颗可 ✕ 移除；发送前可清空
5. **发送规则（建议默认）：**  
   - 允许「仅附件、无文字」（自动用占位文案如「请查看附件」或空 text part + image parts）  
   - 发送中禁用再添加；失败保留 chips 并显示错误
6. **气泡：** user 消息展示文字 + 缩略图（点开可选后期再做）

---

## 3. API 设计（与现有风格对齐）

```ts
/** 宿主可插拔上传；返回供模型/UI 使用的引用 */
export type UploadFileResult =
  | { url: string; mime?: string; name?: string }
  | { base64: string; mime: string; name?: string } // data URL 或纯 base64 + mime
  | { id: string; url?: string; mime?: string; name?: string }; // 宿主对象存储

export type UploadFileHandler = (
  file: File,
  ctx: { signal: AbortSignal; threadId: string | null },
) => Promise<UploadFileResult>;

// 元素上（与 setHostSettingsSlot 同级）
el.setUploadHandler(handler: UploadFileHandler | null): void;
// 或兼容提案命名：
el.hooks = { upload?: UploadFileHandler }; // 内部仍落到同一处

// 可选限制（属性或 setConfig 扩展）
accept?: string;          // 默认 "image/*"（v1）；后期可扩
maxAttachmentBytes?: number; // 默认 4_000_000（约 4MB）
maxAttachments?: number;     // 默认 5
```

**事件（可选）：**

- `sc-attachments-change` — `{ files: PendingAttachment[] }`
- `sc-upload-error` — `{ name, error }`

**Vue / 宿主 wrapper：** expose `setUploadHandler`；props 可选 `onUploadFile`（watch 后 set）。

---

## 4. 消息载荷形状

### 4.1 内部 `ChatMessage`（扩展，向后兼容）

```ts
export type ChatContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
      /** UI / 持久化辅助，不进 OpenAI body 时可 strip */
      name?: string;
      mime?: string;
      attachmentId?: string;
    };

export interface ChatMessage {
  id: string;
  threadId: string;
  role: Role;
  /** 仍保留：纯文本摘要 / 旧数据；有 parts 时以 parts 为准 */
  content: string;
  parts?: ChatContentPart[];
  // ...既有字段
}
```

### 4.2 发往 OpenAI 兼容（vision）

```ts
{
  role: 'user',
  content: [
    { type: 'text', text: '这是什么？' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
    // 或 https URL（宿主 upload 返回）
  ]
}
```

`toOpenAIMessages`：若 `parts` 存在则映射为 array content；否则保持 `content: string`（旧会话零破坏）。

### 4.3 无 hook 时的默认行为

| 策略 | 行为 | 取舍 |
| --- | --- | --- |
| **A（推荐 v1）** | 图片 → `FileReader` / `arrayBuffer` → **data URL base64** 写入 parts；发云端；**不**把巨大 base64 默认持久化到 IDB（或截断策略见开放问题） | 零宿主改动即可 vision；IDB 需谨慎 |
| B | 仅 `URL.createObjectURL` 预览；发送前必须 hook | 嵌入必接 hook；扩展体验差 |
| C | 默认拒绝发送并提示「请配置 upload hook」 | 太严 |

**推荐 A：** 无 hook 时内联 base64 发请求；持久化默认存 **缩略/省略** 或仅 `content` 文本 + `parts` 里标记 `omitted: true`（开放问题里定）。

有 hook：先 `await upload(file)`，用返回的 `url` / `base64` / `id→url` 填 `image_url`。

---

## 5. 分阶段实现（建议）

### Phase A — MVP（本需求主路径）

1. Core：`ChatContentPart`、`ChatEngine.send` 支持 attachments、`toOpenAIMessages` multimodal  
2. Element：paperclip + file input + paste + drag-drop + chips + 发送队列  
3. `setUploadHandler` + 默认 base64  
4. User 气泡图片预览  
5. Demo：示例 hook（可选 mock URL）  
6. 测试 + README 小节  
7. `yarn build:min` 更新 vendor（宿主可选再接 hook）

### Phase B — 持久化加固

- IDB `DB_VERSION = 2`：可选 `attachments` store（Blob）或只存远程 URL  
- 历史重开可显示图（有 URL/Blob 时）

### Phase C — chrome-ai vision（可选）

- `availability({ expectedInputs:[{type:'image'}] })`  
- session `expectedInputs`；prompt 传 Blob parts  
- 不支持则拦截

### Phase D — 非图片文件

- PDF/文本：默认 **不**当 vision；走 hook 抽取文本后拼进 `text` part，或宿主工具  
- 与 SimpleMind/Excalidraw 现有「解析 md/txt/csv/pdf」职责对齐，避免 SDK 内嵌 PDF 解析器

---

## 6. 测试计划

| 包 | 用例 |
| --- | --- |
| core | `toOpenAIMessages`：string-only 旧消息不变；带 `parts` 产出 `image_url`；混合 text+image |
| core | `send` 带 attachments 写入 store 的 `parts` + `content` 摘要 |
| core | 无图路径回归（现有 SSE / tool loop 测试仍绿） |
| element | 选文件后出现 chip；移除 chip；仅图可发；超过 max 报错 |
| element | 无 handler 时发送 body 含 data URL（mock provider 断言） |
| element | 有 handler 时调用且用返回 url |
| element | paste / 键盘 isolation 回归（E1–E5） |
| chrome-ai | `messagesToPrompt` 对 array content：v1 可把 image 标成 `[image]` 占位或跳过（视 Phase C） |

门禁：`yarn test` 通过率 ≥95%（`AGENTS.md`）。

---

## 7. 版本与迁移

| 项 | 建议 |
| --- | --- |
| packages `@simplechat/core|element|vue` | **0.1.0 → 0.2.0**（功能向后兼容加法） |
| 根 / extension manifest | **0.1.2 → 0.2.0** |
| IDB | Phase A 尽量 **不升版本**（只多用可选字段）；Phase B 再 `DB_VERSION = 2` |
| 旧消息 | 无 `parts` 时行为不变 |
| vendor | 发版后 `yarn build:min`；SimpleMind / SimpleExcalidraw **无需立刻改代码**即可用默认 base64 发图；要接自有上传再 `setUploadHandler` |

---

## 8. 预计改动文件

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/types.ts` | `ChatContentPart`、`ChatMessage.parts` |
| `packages/core/src/providers/types.ts` | `OpenAICompatMessage.content: string \| ContentPart[]` |
| `packages/core/src/ChatEngine.ts` | `send(text, opts?)` / attachments；`toOpenAIMessages` |
| `packages/core/src/providers/ChromeAiProvider.ts` | 安全降级（Phase A）；vision（Phase C） |
| `packages/core/src/index.ts` | 导出新类型 |
| `packages/core/src/__tests__/ChatEngine.test.ts` | multimodal 单测 |
| `packages/element/src/SimpleChatElement.ts` | UI + handler + handleSend |
| `packages/element/src/style.css` | chips / paperclip / drag overlay |
| `packages/element/src/__tests__/SimpleChatElement.test.ts` | 附件交互 |
| `packages/vue/src/SimpleChatSidebar.ts` | expose `setUploadHandler`；可选 prop |
| `apps/demo/...` | 演示 hook |
| `README.md` / `README_EN.md` / `AGENTS.md` | 文档 |
| `plan/07-…`（本文件） | 方案记录 |
| （Phase B）`IndexedDBStore.ts` | version bump + blob store |
| 构建后 | `dist/simplechat.min.js` + 兄弟仓库 vendor |

---

## 9. 开放问题（需用户拍板）

1. **范围：** v1 是否 **仅 image/\***？还是也要 PDF/文本（文本内嵌 vs 仅 hook）？  
2. **多文件：** 默认最多几张？建议 **5**；单文件大小建议 **4MB**（Excalidraw 旧 AI 为 2MB，是否对齐 2MB）？  
3. **无文字仅图：** 是否允许发送？占位文案用中文「请查看图片」还是不传 text part？  
4. **无 upload hook 持久化：**  
   - (a) 不持久化图片，刷新后只留文字摘要  
   - (b) IDB 存 base64（简单但胀库）  
   - (c) IDB 独立 Blob store（推荐中长期）  
5. **chrome-ai：** Phase A 遇图直接拦截并提示改云端，还是顺手做 Phase C multimodal？  
6. **API 命名：** `setUploadHandler`（更贴现有） vs `hooks.upload` / `onUploadFile` prop（更贴用户原话）——可 **三者同义**，文档主推 `setUploadHandler`。  
7. **detail：** `image_url.detail` 默认 `auto` 还是 `low`（省 token）？  
8. **宿主：** 确认后是否立刻改 SimpleMind / SimpleExcalidraw wrapper 接 hook，还是只更新 min.js、宿主后续再接？

---

## 10. 确认后执行顺序（摘要）

1. 冻结开放问题答案 → 更新本文件「已决议」小节  
2. TDD：core `toOpenAIMessages` / `send`  
3. Element UX + handler  
4. 文档 + demo  
5. version bump + `yarn test` + `yarn build:min`  
6. （可选）宿主 wrapper expose + 示例 upload  

**请确认开放问题后再开始编码。**
