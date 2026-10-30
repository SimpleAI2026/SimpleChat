# SimpleChat

English | [中文](./README.md)

A pure front-end, embeddable **OpenAI-compatible** sidebar chat SDK. The host passes `apiBaseUrl` / `apiKey` / `model`, and can `registerTool` so the model calls in-browser host APIs. Default UI is a shadcn-style black-and-white theme.

- Repository: https://github.com/SimpleAI2026/SimpleChat

> Design notes live under [`plan/`](./plan/). This repo implements phases P0–P4 (Core / Web Component / Vue thin wrapper / Demo). Host integration (e.g. SimpleMind) uses a **browser min bundle copy** — **not** Yarn portal / npm link.

## Packages

| Package | Role |
| --- | --- |
| `@simplechat/core` | `ChatEngine`, tool registry, IndexedDB / Memory history, SSE streaming, `normalizeSecret` |
| `@simplechat/element` | `<simple-chat>` Web Component (Shadow DOM + `--sc-*`) |
| `@simplechat/vue` | Vue 3 thin wrapper `SimpleChatSidebar` (for monorepo use) |
| `@simplechat/demo` | Vite demo: config panel + sidebar + sample tools |
| Chrome extension | `yarn build:extension` → `dist-extension/` full-page `layout="extension"` |

## Quick start

> Packages publish from `packages/*/dist`. After clone: `yarn install && yarn build`.

```bash
yarn install
yarn workspace @simplechat/core test
yarn workspace @simplechat/demo dev
```

Open the local URL shown in the terminal and fill in:

- **API Base URL** (e.g. `https://api.openai.com/v1` or SiliconFlow) — **do not** append `/chat/completions`
- **API Key**
- **Model**

You can also open **⚙ Settings** at the top-right of the sidebar to configure inside the component (recommended for hosts such as SimpleMind).

Optionally check “Remember API Key” to store the key in localStorage (XSS risk).

If env vars (or Vite `VITE_*`) are set, empty forms/settings prefill from:

| Purpose | Accepted names (any) |
| --- | --- |
| Base URL | `OPENAI_BASE_URL`, `OPENAI_BASEURL`, `VITE_OPENAI_BASE_URL`, `VITE_OPENAI_BASEURL` |
| API Key | `OPENAI_API_KEY`, `OPENAI_KEY`, `VITE_OPENAI_API_KEY`, `VITE_OPENAI_KEY` |
| Model | `OPENAI_MODEL`, `MODEL`, `VITE_OPENAI_MODEL`, `VITE_MODEL` |

Example: put `VITE_OPENAI_BASE_URL=…` in `apps/demo/.env`, then `yarn dev`.

Sample tools: `get_page_title`, `alert_message`, `propose_style_css` (the model only writes CSS into the left input; the user must click “Apply” for it to take effect).


## Chrome Built-in AI (Gemini Nano)

- Settings ⚙ → provider **OpenAI-compatible** or **Chrome Built-in AI (Gemini Nano)**.
- Nano uses `globalThis.LanguageModel` (Prompt API). No API key. **Tools are cloud-only** on Nano (v1 skips `registerTool`).
- Status: unavailable / downloadable / downloading % / available; Detect + Download in settings.
- Default: if no API key and LanguageModel is available/downloadable → prefer `chrome-ai`.
- Requirements: Chrome **~148+ (web)** or **~138+ (extension)** with Prompt API enabled.
- If Nano is not ready, send is blocked with guidance.

## Keyboard isolation (Shadow DOM)

Composer and settings inputs call `stopPropagation()` on `keydown`/`keyup`/`keypress` so host document listeners (e.g. Excalidraw) do not steal keys. Enter sends; Shift+Enter newline. Hosts may call `focusComposer()`.

## Browser min bundle (host vendor, no npm portal)

Hosts such as [SimpleMind](https://github.com/SimpleAI2026/SimpleMind) **must not** Yarn-portal / npm-link this monorepo. Build one minified ESM that registers `<simple-chat>` and exports width helpers:

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

### Current SimpleMind integration

| Item | Detail |
| --- | --- |
| Artifact path | `yarn build:min` → `SimpleMind/src/vendor/simplechat/simplechat.min.js` |
| Chat panel | Right-side editor panel with `<simple-chat>`; multi-turn chat + `registerTool` |
| Settings ⚙ | Top-right drawer: Base URL / API Key / Model / theme / tool styles; hosts may inject via `setHostSettingsSlot` |
| `my-` key | If the API key starts with `my-`, strip the prefix and **Base64-decode** (URL-safe) before Bearer auth; on failure keep the original (`normalizeSecret`) |
| Resizable | Left-edge resize handle (~320–720px), synced with `--sc-width`, `localStorage` `simplechat:sidebar-width`, host `--ai-panel-width` |
| Dependency | **No** npm portal / Yarn link — copy the min file only |

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

### Vue 3 (monorepo package)

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

| Field | Meaning |
| --- | --- |
| `apiBaseUrl` | OpenAI-compatible root — **without** `/chat/completions` |
| `apiKey` | `Authorization: Bearer …`; supports `my-` + Base64 (see below) |
| `model` | Model id |
| `systemPrompt` | Optional |
| `storageKey` | Namespace for IndexedDB and settings localStorage |

Requests go to: `POST {apiBaseUrl}/chat/completions`.

### `my-` API key (Base64 decrypt)

Before each request, `ChatEngine` runs the key through `normalizeSecret`:

- No `my-` prefix: trim and use as-is
- Starts with `my-`: strip the prefix, decode as **URL-safe Base64** (`-`/`_` → `+`/`/`, pad `=`); on failure fall back to the original string

Useful for storing an encoded value in config instead of plaintext.

### Config precedence

1. Non-empty host props / attrs / `setConfig`
2. localStorage (`${storageKey}:settings`: always Base URL / Model / system prompt / `themeId` / tool styles / `rememberKey`; key only if “Remember API Key” is checked)
3. Environment (`readEnvDefaults()`, table above; no systemPrompt)
4. Empty

`<simple-chat>` top-right **⚙** opens the settings drawer (including **system prompt**). **Save** writes localStorage and `updateConfig` without a reload. Cancel or toggle ⚙ again closes without applying unsaved edits.

### System prompt APIs

| Method | Usage |
| --- | --- |
| Vue prop | `:config="{ systemPrompt: '…' }"` |
| WC attribute | `system-prompt="…"` |
| WC accessor | `el.systemPrompt = '…'` |
| `setConfig` | `el.setConfig({ systemPrompt: '…' })` |
| Panel settings | ⚙ → system prompt → Save (emits `sc-settings` with `systemPrompt`) |

Non-empty host values win over localStorage.

## Theme

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

```vue
<SimpleChatSidebar theme-id="ocean" />
```

```js
el.setTheme('terminal')
// or
el.themeId = 'violet'
```

Precedence: host `themeCss` / `themeStyle` (highest) → host `themeId` → localStorage `themeId` → `bw`.

⚙ can also edit **tool styles** (`--sc-tool-bg` / border / radius / font-size), persisted with the theme.

Shadow DOM does **not** inherit parent CSS variables; override with:

```vue
<SimpleChatSidebar
  theme-id="bw"
  :theme-style="{ '--sc-primary': '#2563eb' }"
  :theme-css="':host { --sc-tool-bg: #eef2ff; }'"
/>
```

## Resizable sidebar

With `layout="sidebar"` / `panel`, drag to resize:

- Constants: `SC_WIDTH_MIN` / `SC_WIDTH_MAX` / `SC_WIDTH_DEFAULT`
- Persistence: `localStorage` key `simplechat:sidebar-width` (`loadSidebarWidth` / `clampSidebarWidth`)
- Event: `sc-resize` (detail includes width)

## Security

Holding an API key in the browser is **only for personal / intranet demos**. Production should use a same-origin proxy (`proxyUrl` roadmap, plan P6). “Remember API Key” (demo form or in-component settings) writes localStorage and has XSS risk. `my-` encoding is **not** encryption — only light obfuscation for paste/config.


## Chrome extension (full page)

MV3 scaffold similar to SimpleMind: the action icon opens a full-tab app.

```bash
yarn build:extension
# or yarn build:all
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. **Load unpacked** → select `dist-extension` at the repo root

`<simple-chat layout="extension">` keeps a left thread rail (not a full-screen overlay by default), a wider message column (~640–720px bubbles), and the full settings drawer (OpenAI / Chrome AI Nano, themes, system prompt, tool style, host slot). The close control is hidden in this layout.

**Chrome version**: Gemini Nano / Prompt API needs **138+** in extensions (about 148+ on the web). Cloud calls use `host_permissions` (default `https://*/*`).

## License

MIT — see [LICENSE](./LICENSE).
