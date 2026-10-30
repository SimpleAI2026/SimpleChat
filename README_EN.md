# SimpleChat

English | [中文](./README.md)

**Chrome extension: offline on-device AI chat — simple and convenient.** Powered by Chrome’s built-in **Gemini Nano** (Prompt API). Conversations stay on your device — **no API key, no network required, privacy by default**. Optionally switch to any OpenAI-compatible cloud API.

- Repository: https://github.com/SimpleAI2026/SimpleChat
- Highlights: **offline chat** · **on-device Gemini Nano** · **zero-config start** · **simple UI**

> Design notes live under [`plan/`](./plan/). This repo also ships an embeddable OpenAI-compatible chat SDK (see [Developers / Embed](#developers--embed) below). The primary user-facing entry is the **Chrome extension**.

## Why SimpleChat?

| Highlight | Detail |
| --- | --- |
| **Offline chat** | On-device Gemini Nano — works without a network |
| **No API key** | Nano path never uploads your chat; privacy-friendly |
| **Simple & convenient** | Install → click the icon → chat; minimal setup |
| **Cloud optional** | Switch to an OpenAI-compatible API for stronger models or tools |
| **Chrome 138+** | Extension Prompt API / Gemini Nano needs Chrome **138+** |

## Quick start (Chrome extension)

### Load from source (dev / personal use)

```bash
yarn install
yarn build:extension
# or yarn build:all
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. **Load unpacked** → select `dist-extension` at the repo root
4. Click the extension icon to open the full-page chat tab

`<simple-chat layout="extension">` keeps a left thread rail, a wider message column (~640–720px bubbles), and the full settings drawer. The close control is hidden in this layout.

### Use Chrome Built-in AI (Gemini Nano)

1. Use **Chrome 138+** and enable the Prompt API / Gemini Nano (per Chrome’s docs).
2. Open the extension → top-right **⚙ Settings** → provider **Chrome Built-in AI (Gemini Nano)**.
3. Check status: unavailable / downloadable / downloading % / available; use “Recheck” / “Download model”.
4. Once Nano is ready, send messages — **no API key needed**.

Notes:

- Nano uses `globalThis.LanguageModel` (Prompt API); inference stays on-device.
- **Tools are cloud-only** on Nano (v1 skips `registerTool`; UI shows “tools need cloud”).
- Default: if there is no API key and LanguageModel is available/downloadable, prefer `chrome-ai`.
- When Nano is not ready, send is blocked with guidance.
- Web embeds need about Chrome **148+**; **extensions about 138+**.

### Optional: OpenAI-compatible cloud

⚙ → provider **OpenAI-compatible (cloud)**, fill Base URL / API Key / Model. Cloud calls use `host_permissions` (default `https://*/*`).

---

## Packages

| Package | Role |
| --- | --- |
| `@simplechat/core` | `ChatEngine`, tool registry, IndexedDB / Memory history, SSE streaming, `normalizeSecret` |
| `@simplechat/element` | `<simple-chat>` Web Component (Shadow DOM + `--sc-*`) |
| `@simplechat/vue` | Vue 3 thin wrapper `SimpleChatSidebar` (for monorepo use) |
| `@simplechat/demo` | Vite demo: config panel + sidebar + sample tools |
| Chrome extension | `yarn build:extension` → `dist-extension/` full-page `layout="extension"` |

---

## Developers / Embed

A pure front-end, embeddable **OpenAI-compatible** sidebar chat SDK. The host passes `apiBaseUrl` / `apiKey` / `model`, and can `registerTool` so the model calls in-browser host APIs. Default UI is a shadcn-style black-and-white theme. Host integration (e.g. SimpleMind) uses a **browser min bundle copy** — **not** Yarn portal / npm link. This repo implements phases P0–P4 (Core / Web Component / Vue thin wrapper / Demo).

### Demo quick start

> Packages publish from `packages/*/dist`. After clone: `yarn install && yarn build`.

```bash
yarn install
yarn workspace @simplechat/core test
yarn workspace @simplechat/demo dev
```

Open the local URL and fill API Base URL / API Key / Model, or use **⚙ Settings**. You can also use **Chrome Built-in AI** above with no key.

Optionally check “Remember API Key” to store the key in localStorage (XSS risk).

If env vars (or Vite `VITE_*`) are set, empty forms/settings prefill from:

| Purpose | Accepted names (any) |
| --- | --- |
| Base URL | `OPENAI_BASE_URL`, `OPENAI_BASEURL`, `VITE_OPENAI_BASE_URL`, `VITE_OPENAI_BASEURL` |
| API Key | `OPENAI_API_KEY`, `OPENAI_KEY`, `VITE_OPENAI_API_KEY`, `VITE_OPENAI_KEY` |
| Model | `OPENAI_MODEL`, `MODEL`, `VITE_OPENAI_MODEL`, `VITE_MODEL` |

Sample tools: `get_page_title`, `alert_message`, `propose_style_css`.

### Keyboard isolation (Shadow DOM)

Composer and settings inputs `stopPropagation()` on `keydown` / `keyup` / `keypress` so host document listeners (e.g. Excalidraw) do not steal keys. Enter sends; Shift+Enter newline. Hosts may call `focusComposer()`.

See root [`AGENTS.md`](./AGENTS.md).

### Browser min bundle (host vendor, no npm portal)

Hosts (e.g. [SimpleMind](https://github.com/SimpleAI2026/SimpleMind)) should **not** Yarn-portal / npm-link this monorepo. Build a minified ESM:

```bash
yarn build:min
# → dist/simplechat.min.js
# If sibling ../SimpleMind exists, also copies to:
#    ../SimpleMind/src/vendor/simplechat/simplechat.min.js
yarn build:min --no-copy   # dist only
```

Import in the host:

```js
import {
  loadSidebarWidth,
  clampSidebarWidth,
  SC_WIDTH_DEFAULT,
} from './vendor/simplechat/simplechat.min.js';
// side effect: customElements.define('simple-chat', …)
```

Styles live inside the element’s Shadow DOM (`defaultStyles`); no separate CSS file is required. SimpleMind wraps `<simple-chat layout="panel">` with a local `src/components/SimpleChatSidebar.js` and has **no** `@simplechat/*` dependency.

#### Current SimpleMind integration

| Item | Detail |
| --- | --- |
| Artifact path | `yarn build:min` → `SimpleMind/src/vendor/simplechat/simplechat.min.js` |
| Chat panel | Right-side editor panel with `<simple-chat>`; multi-turn chat + `registerTool` |
| Settings ⚙ | Top-right drawer: Base URL / API Key / Model / theme / tool styles; hosts may inject via `setHostSettingsSlot` |
| `my-` key | If the API key starts with `my-`, strip the prefix and **Base64-decode** (URL-safe) before Bearer auth; on failure keep the original (`normalizeSecret`) |
| Resizable | Left-edge resize handle (~320–720px), synced with `--sc-width`, `localStorage` `simplechat:sidebar-width`, host `--ai-panel-width` |
| Dependency | **No** npm portal / Yarn link — copy the min file only |

### Embed

#### Web Component

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

#### Vue 3 (monorepo package)

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

### Config

| Field | Meaning |
| --- | --- |
| `apiBaseUrl` | OpenAI-compatible root — **without** `/chat/completions` |
| `apiKey` | `Authorization: Bearer …`; supports `my-` + Base64 (see below) |
| `model` | Model id |
| `systemPrompt` | Optional |
| `storageKey` | Namespace for IndexedDB and settings localStorage |

Requests go to: `POST {apiBaseUrl}/chat/completions`.

#### `my-` API key (Base64 decrypt)

Before each request, `ChatEngine` runs the key through `normalizeSecret`:

- No `my-` prefix: trim and use as-is
- Starts with `my-`: strip the prefix, decode as **URL-safe Base64** (`-`/`_` → `+`/`/`, pad `=`); on failure fall back to the original string

#### Config precedence

1. Non-empty host props / attrs / `setConfig`
2. localStorage (`${storageKey}:settings`: always Base URL / Model / system prompt / `themeId` / tool styles / `rememberKey`; key only if “Remember API Key” is checked)
3. Environment (`readEnvDefaults()`, table above; no systemPrompt)
4. Empty

`<simple-chat>` top-right **⚙** opens the settings drawer (including **system prompt**). **Save** writes localStorage and `updateConfig` without a reload.

#### System prompt APIs

| Method | Usage |
| --- | --- |
| Vue prop | `:config="{ systemPrompt: '…' }"` |
| WC attribute | `system-prompt="…"` |
| WC accessor | `el.systemPrompt = '…'` |
| `setConfig` | `el.setConfig({ systemPrompt: '…' })` |
| Panel settings | ⚙ → system prompt → Save (emits `sc-settings` with `systemPrompt`) |

### Theme

Ten named themes (`listThemes()` / `getThemeCss(id)`):

| id | Label |
| --- | --- |
| `bw` | Black & white (default) |
| `minimal` | Minimal |
| `ink` | Ink |
| `ocean` | Ocean |
| `forest` | Forest |
| `sunset` | Sunset |
| `violet` | Violet |
| `warmpaper` | Warm paper |
| `contrast` | High contrast |
| `terminal` | Terminal |

```js
el.setTheme('terminal')
// or
el.themeId = 'violet'
```

Precedence: host `themeCss` / `themeStyle` (highest) → host `themeId` → localStorage `themeId` → `bw`.

### Resizable sidebar

With `layout="sidebar"` / `panel`, drag to resize:

- Constants: `SC_WIDTH_MIN` / `SC_WIDTH_MAX` / `SC_WIDTH_DEFAULT`
- Persistence: `localStorage` key `simplechat:sidebar-width`
- Event: `sc-resize` (detail includes width)

### Security

Holding an API key in the browser is **only for personal / intranet demos**. Production should use a same-origin proxy (`proxyUrl` roadmap, plan P6). “Remember API Key” writes localStorage and has XSS risk. `my-` encoding is **not** encryption. **On-device Nano chat never leaves the device and needs no API key.**

## License

MIT — see [LICENSE](./LICENSE).
