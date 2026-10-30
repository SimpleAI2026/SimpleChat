<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { SimpleChatSidebar } from '@simplechat/vue';
import {
  listThemes,
  normalizeHostThemeCss,
  readEnvDefaults,
  type HostTool,
  type SimpleChatConfig,
} from '@simplechat/core';

const STORAGE = 'simplechat-demo-config';

const FALLBACK = {
  apiBaseUrl: 'https://api.siliconflow.cn/v1',
  model: 'zai-org/GLM-5.3-Flash',
  systemPrompt:
    '你是简洁有帮助的助手。需要时调用已注册工具。当用户要求「修改样式」或调整侧栏/工具卡片外观时，调用 propose_style_css 把 CSS 写入左侧输入框，不要声称已经生效；提醒用户点击左侧「应用配置」才会生效。优先传 tokens（--sc-primary / --sc-background / --sc-border / --sc-tool-bg 等，不要用 *-color 后缀或 :root）。',
};

const themes = listThemes();

const CSS_PLACEHOLDER =
  '可在右侧对话框对 AI 说「修改样式…」，AI 会把 CSS 填到这里；确认后点「应用配置」。\n必须用 :host（不要用 :root）。Token 示例：\n:host {\n  --sc-primary: #0369a1;\n  --sc-background: #fff;\n  --sc-border: #e5e5e5;\n  --sc-tool-bg: #e0f2fe;\n  --sc-tool-radius: 12px;\n}';

const form = reactive({
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  systemPrompt: FALLBACK.systemPrompt,
  rememberKey: false,
  themeId: 'bw',
  /** Draft CSS — AI / user edits; applied only after「应用配置」. */
  customCss: '',
});

const applied = ref<Partial<SimpleChatConfig>>({});
const appliedThemeId = ref('bw');
const appliedThemeCss = ref('');
const chatOpen = ref(true);

onMounted(() => {
  const env = readEnvDefaults();
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(form, saved);
      if (!form.rememberKey) form.apiKey = '';
    }
  } catch {
    /* ignore */
  }
  if (!String(form.apiBaseUrl || '').trim()) {
    form.apiBaseUrl = env.apiBaseUrl || FALLBACK.apiBaseUrl;
  }
  if (!String(form.model || '').trim()) {
    form.model = env.model || FALLBACK.model;
  }
  if (!String(form.apiKey || '').trim() && env.apiKey) {
    form.apiKey = env.apiKey;
  }
  if (!String(form.systemPrompt || '').trim()) {
    form.systemPrompt = FALLBACK.systemPrompt;
  }
  const anyForm = form as Record<string, unknown>;
  if ('accent' in anyForm || 'primary' in anyForm) {
    delete anyForm.accent;
    delete anyForm.primary;
  }
  if (!themes.some((t) => t.id === form.themeId)) form.themeId = 'bw';
  if (typeof form.customCss !== 'string') form.customCss = '';
  applyConfig();
});

watch(
  form,
  () => {
    const toSave = { ...form };
    if (!toSave.rememberKey) toSave.apiKey = '';
    localStorage.setItem(STORAGE, JSON.stringify(toSave));
  },
  { deep: true },
);

/** Apply theme pack + current CSS draft to the sidebar. */
function applyConfig() {
  console.log('[SimpleChat demo] 应用配置 clicked', {
    themeId: form.themeId,
    customCssLen: (form.customCss || '').length,
    apiBaseUrl: form.apiBaseUrl,
    model: form.model,
  });
  applied.value = {
    apiBaseUrl: form.apiBaseUrl.trim().replace(/\/+$/, ''),
    apiKey: form.apiKey.trim(),
    model: form.model.trim(),
    systemPrompt: form.systemPrompt.trim(),
  };
  appliedThemeId.value = form.themeId || 'bw';
  // Normalize :root→:host and alias tokens so Apply actually affects Shadow DOM.
  appliedThemeCss.value = normalizeHostThemeCss(form.customCss);
  // Also rewrite the draft so the textarea shows real tokens after apply.
  if (appliedThemeCss.value && appliedThemeCss.value !== form.customCss.trim()) {
    form.customCss = appliedThemeCss.value;
  }
  chatOpen.value = true;
}

const tools: HostTool[] = [
  {
    name: 'get_page_title',
    description: '获取当前 Demo 页面的 document.title',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => ({ title: document.title }),
  },
  {
    name: 'alert_message',
    description: '弹出浏览器 alert 显示一条消息',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要显示的文本' },
      },
      required: ['message'],
    },
    handler: async ({ message }: { message: string }) => {
      window.alert(message);
      return { ok: true };
    },
  },
  {
    name: 'propose_style_css',
    description:
      '当用户要求修改侧栏/主题/工具卡片样式时调用：仅写入左侧「自定义 CSS」，不自动生效；提醒用户点「应用配置」。优先传 tokens，键名必须是真实 token：--sc-primary、--sc-background、--sc-border、--sc-tool-bg、--sc-tool-radius 等（不要用 --sc-primary-color / :root）。也可传 css，选择器用 :host。',
    parameters: {
      type: 'object',
      properties: {
        tokens: {
          type: 'object',
          description:
            '推荐。真实 token 映射，如 {"--sc-primary":"#0369a1","--sc-background":"#fff","--sc-border":"#000","--sc-tool-bg":"#E0E0E0","--sc-tool-radius":"12px"}。禁止 --sc-primary-color / --sc-bg-color 等错误名。',
          additionalProperties: { type: 'string' },
        },
        css: {
          type: 'string',
          description:
            '可选。完整 CSS，须为合法 JSON 字符串（换行写成 \n）。推荐 :host { --sc-*: … }。若同时有 tokens，以 tokens 生成的 CSS 为准。',
        },
        note: {
          type: 'string',
          description: '可选：给用户的简短说明（中文）',
        },
      },
      additionalProperties: false,
    },
    handler: async (args: {
      css?: string;
      tokens?: Record<string, string>;
      note?: string;
    }) => {
      let next = '';
      const tokens = args.tokens && typeof args.tokens === 'object' ? args.tokens : null;
      if (tokens && Object.keys(tokens).length) {
        const lines = Object.entries(tokens)
          .map(([k, v]) => {
            const key = String(k).trim();
            const val = String(v ?? '').trim();
            if (!key || !val) return '';
            const prop = key.startsWith('--') ? key : `--${key}`;
            return `  ${prop}: ${val};`;
          })
          .filter(Boolean);
        next = `:host {\n${lines.join('\n')}\n}`;
      } else {
        next = String(args.css || '').trim();
      }
      if (!next) {
        return { ok: false, error: '请提供 tokens 或 css' };
      }
      form.customCss = normalizeHostThemeCss(next) || next;
      return {
        ok: true,
        applied: false,
        message: '已写入左侧「自定义 CSS」输入框，请用户点击「应用配置」后才会生效',
        note: args.note || undefined,
        length: next.length,
      };
    },
  }
];

const wikiInstall = `npm i @simplechat/vue
# 或
npm i @simplechat/element`;

const wikiVue = `import { SimpleChatSidebar } from '@simplechat/vue'

<SimpleChatSidebar
  v-model:open="open"
  :config="{ apiBaseUrl, apiKey, model, systemPrompt }"
  :tools="tools"
  theme-id="ocean"
  :theme-css="customCss"
  storage-key="my-app"
/>`;

const wikiElement = `import '@simplechat/element'
const el = document.querySelector('simple-chat')
el.setTheme('ocean')
el.applyThemeCss(':host { --sc-tool-bg: #e0f2fe; }')
el.registerTool({ name, description, parameters, handler })`;
</script>

<template>
  <div class="demo-page">
    <header class="demo-top">
      <h1>SimpleChat Demo</h1>
      <nav>
        <a href="/plan/README.md" target="_blank" rel="noreferrer">文档</a>
        <a href="https://github.com/SimpleAI2026/SimpleChat" target="_blank" rel="noreferrer">GitHub</a>
      </nav>
    </header>
    <div class="demo-main">
      <aside class="demo-config">
        <h2>Config</h2>
        <div class="field">
          <label>API Base URL</label>
          <input v-model="form.apiBaseUrl" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="field">
          <label>API Key</label>
          <input
            v-model="form.apiKey"
            type="password"
            placeholder="sk-…"
            autocomplete="off"
          />
          <label class="remember">
            <input v-model="form.rememberKey" type="checkbox" />
            <span>记住 API Key</span>
          </label>
        </div>
        <div class="field">
          <label>Model</label>
          <input v-model="form.model" placeholder="model id" />
        </div>
        <div class="field">
          <label>System Prompt</label>
          <textarea v-model="form.systemPrompt" rows="3" />
        </div>
        <div class="field">
          <label>主题 Theme</label>
          <div class="theme-grid" role="radiogroup" aria-label="主题">
            <label
              v-for="t in themes"
              :key="t.id"
              class="theme-option"
              :class="{ active: form.themeId === t.id }"
              :style="{ '--sw1': t.swatch[0], '--sw2': t.swatch[1], '--sw3': t.swatch[2] }"
            >
              <input v-model="form.themeId" type="radio" :value="t.id" />
              <span class="theme-swatch" aria-hidden="true" />
              <span class="theme-label">{{ t.label }}</span>
            </label>
          </div>
          <label class="css-label">自定义 CSS</label>
          <textarea
            v-model="form.customCss"
            class="css-editor"
            rows="7"
            spellcheck="false"
            :placeholder="CSS_PLACEHOLDER"
          />
          <p class="hint css-hint">
            可在右侧对话框说「修改样式…」，AI 通过 <code>propose_style_css</code> 填入上方 CSS；确认后点击下方「应用配置」才会改聊天外观。
          </p>
        </div>
        <button class="btn" type="button" @click="applyConfig">应用配置</button>
        <button class="btn secondary" type="button" @click="chatOpen = !chatOpen">
          {{ chatOpen ? '收起侧栏' : '展开侧栏' }}
        </button>
        <p class="hint">
          Base URL <strong>不要</strong>包含 <code>/chat/completions</code>；客户端会自动拼接。侧栏右上角 ⚙
          也可打开内置设置（主题、系统提示词、工具样式）。
        </p>
        <div class="warn">
          ⚠️ API Key 仅用于个人/内网 Demo。勾选「记住」会写入本机 localStorage，存在 XSS 泄露风险。生产请用同源代理。
        </div>
        <p class="hint">
          示例工具：<code>get_page_title</code>、<code>alert_message</code>、<code>propose_style_css</code>
        </p>
      </aside>

      <section class="demo-preview">
        <article class="demo-wiki">
          <header class="demo-wiki-head">
            <h2>接入指引</h2>
            <p>宿主画布示意 · 右侧为可嵌入的 SimpleChat 侧栏</p>
          </header>

          <section class="wiki-section">
            <h3>1. 安装 / 引入</h3>
            <pre><code>{{ wikiInstall }}</code></pre>
            <p>Vue 用 <code>@simplechat/vue</code>；任意框架可用 Web Component <code>@simplechat/element</code>。</p>
          </section>

          <section class="wiki-section">
            <h3>2. 配置 Base URL / Key / Model</h3>
            <ul>
              <li><strong>宿主 props</strong>：传入 <code>:config="{ apiBaseUrl, apiKey, model }"</code>（最高优先级）</li>
              <li><strong>组件内设置</strong>：点右上角 ⚙，填写后点「保存」→ 写入 <code>localStorage</code>（<code>${storageKey}:settings</code>）</li>
              <li><strong>环境变量</strong>：空配置时预填 <code>OPENAI_*</code> / <code>VITE_*</code>（见 README）</li>
            </ul>
            <pre><code>{{ wikiVue }}</code></pre>
          </section>

          <section class="wiki-section">
            <h3>3. 主题 + 自定义 CSS</h3>
            <p>
              内置 10 套主题（<code>theme-id</code>）。左侧可再填自定义 CSS，点「应用配置」后作为
              <code>themeCss</code> 叠在主题之上（推荐 <code>:host &#123; --sc-*: … &#125;</code>）。
            </p>
            <p>
              右侧聊天说「修改样式…」会触发 <code>propose_style_css</code>：只填充输入框，需再点<strong>应用配置</strong>。
            </p>
            <pre><code>theme-id="ocean"
:theme-css="':host { --sc-tool-bg: #eef2ff; --sc-primary: #0369a1; }'"</code></pre>
          </section>

          <section class="wiki-section">
            <h3>4. 工具 Tools</h3>
            <p>
              Demo 工具：<code>get_page_title</code>、<code>alert_message</code>、<code>propose_style_css</code>。
            </p>
            <pre><code>{{ wikiElement }}</code></pre>
          </section>

          <section class="wiki-section">
            <h3>5. 系统提示词</h3>
            <ul>
              <li>Vue：<code>:config="{ systemPrompt }"</code></li>
              <li>WC：属性 <code>system-prompt</code>、属性 <code>el.systemPrompt = '…'</code>、或 <code>setConfig({ systemPrompt })</code></li>
              <li>面板：⚙ →「系统提示词」→ 保存（可持久化；宿主非空值仍优先）</li>
            </ul>
          </section>

          <section class="wiki-section wiki-note">
            <p>
              优先级：宿主非空 props/attrs → localStorage → 环境变量 → 空。自定义 CSS 经「应用配置」后以
              <code>themeCss</code> 覆盖主题 token。
            </p>
          </section>
        </article>

        <SimpleChatSidebar
          v-model:open="chatOpen"
          :config="applied"
          :tools="tools"
          :theme-id="appliedThemeId"
          :theme-css="appliedThemeCss"
          storage-key="simplechat-demo"
          layout="sidebar"
          position="right"
        />
      </section>
    </div>
  </div>
</template>
