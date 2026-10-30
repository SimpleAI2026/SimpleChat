import {
  ChatEngine,
  indexedDbStore,
  MemoryStore,
  composeThemeCss,
  normalizeHostThemeCss,
  DEFAULT_THEME_ID,
  DEFAULT_MODEL,
  getTheme,
  listThemes,
  loadPersistedSettings,
  loadSidebarWidth,
  mergeConfigPriority,
  readEnvDefaults,
  isThemeId,
  resolveThemeId,
  savePersistedSettings,
  saveSidebarWidth,
  clampSidebarWidth,
  SC_WIDTH_DEFAULT,
  checkChromeAiAvailability,
  CHROME_AI_STATUS,
  isChatProviderId,
  type ChatMessage,
  type ChatThread,
  type HostTool,
  type PersistedSettings,
  type SimpleChatConfig,
  type ToolStyleOverrides,
  type ChatProviderId,
  type ChromeAiStatus,
} from '@simplechat/core';
import { defaultStyles } from './styles.js';
import { renderMarkdown } from './markdown.js';

export interface SimpleChatElementProps {
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  storageKey?: string;
  position?: 'left' | 'right';
  layout?: 'sidebar' | 'panel' | 'extension';
  open?: boolean;
  themeId?: string;
  themeCss?: string;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export class SimpleChatElement extends HTMLElement {
  static get observedAttributes() {
    return [
      'api-base-url',
      'model',
      'storage-key',
      'position',
      'layout',
      'open',
      'system-prompt',
      'theme-id',
      'theme-css',
    ];
  }

  private shadow: ShadowRoot;
  private engine: ChatEngine | null = null;
  private _apiKey = '';
  private _systemPrompt = '';
  private _themeId = '';
  private _hostThemeCss = '';
  private _toolStyle: ToolStyleOverrides = {};
  private streaming = false;
  private showThreads = false;
  private showSettings = false;
  private settingsRememberKey = false;
  private _provider: ChatProviderId | '' = '';
  private chromeAiStatus: ChromeAiStatus = CHROME_AI_STATUS.UNKNOWN;
  private chromeAiProgress = 0;
  private chromeAiChecking = false;
  private chromeAiDownloading = false;
  private suppressAttrSync = false;
  private messages: ChatMessage[] = [];
  private threads: ChatThread[] = [];
  private errorText = '';
  private pendingTools = new Map<string, { name: string; args: string; status: string; result?: string }>();
  private rootEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private threadNameEl!: HTMLElement;
  private drawerEl!: HTMLElement;
  private settingsEl!: HTMLElement;
  private hostSettingsSlotEl: HTMLElement | null = null;
  private hostSettingsNode: HTMLElement | null = null;
  private errorEl!: HTMLElement;
  private styleEl!: HTMLStyleElement;
  private resizeHandleEl: HTMLElement | null = null;
  private panelWidth = SC_WIDTH_DEFAULT;
  private resizing = false;
  private unbound: Array<() => void> = [];

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.renderShell();
    this.ensureEngine();
    void this.refresh();
  }

  disconnectedCallback(): void {
    for (const u of this.unbound) u();
    this.unbound = [];
    this.engine?.stop();
  }

  attributeChangedCallback(name?: string): void {
    if (!this.isConnected || this.suppressAttrSync) return;
    if (name === 'theme-css') {
      // Prefer in-memory CSS set via applyThemeCss(); attribute is only a short hint
      // because multiline CSS is mangled in HTML attributes.
      const attr = this.getAttribute('theme-css') || '';
      if (attr && !this._hostThemeCss) {
        this._hostThemeCss = normalizeHostThemeCss(attr);
      }
      this.rebuildThemeLayers();
      return;
    }
    if (name === 'theme-id') {
      this._themeId = this.getAttribute('theme-id') || '';
      this.rebuildThemeLayers();
      return;
    }
    this.ensureEngine(true);
    this.applyLayout();
    void this.refresh();
  }

  get apiKey(): string {
    return this._apiKey;
  }
  set apiKey(v: string) {
    this._apiKey = v ?? '';
    this.engine?.updateConfig({ apiKey: this._apiKey });
  }

  get systemPrompt(): string {
    return this._systemPrompt || this.getAttribute('system-prompt') || '';
  }
  set systemPrompt(v: string) {
    this._systemPrompt = v ?? '';
    // Prefer in-memory prompt — never mirror multiline text into the attribute
    // (Vue/HTML attribute sync mangles newlines, same class of bug as themeCss).
    this.suppressAttrSync = true;
    try {
      this.removeAttribute('system-prompt');
    } finally {
      this.suppressAttrSync = false;
    }
    this.engine?.updateConfig({ systemPrompt: this._systemPrompt });
  }

  get themeId(): string {
    return this.resolveActiveThemeId();
  }
  set themeId(v: string) {
    this.setTheme(v);
  }

  /** Apply a named theme pack (host-level themeId). Persists unless persist:false. */
  setTheme(id: string, opts?: { persist?: boolean }): string {
    const raw = (id || '').trim();
    const next = isThemeId(raw) ? raw : DEFAULT_THEME_ID;
    this._themeId = next;
    this.suppressAttrSync = true;
    try {
      this.setAttribute('theme-id', next);
    } finally {
      this.suppressAttrSync = false;
    }
    if (opts?.persist !== false) this.persistThemeState();
    this.rebuildThemeLayers();
    return next;
  }

  /** Current tool-card style overrides (may be empty). */
  getToolStyle(): ToolStyleOverrides {
    if (Object.keys(this._toolStyle).length) return { ...this._toolStyle };
    const stored = loadPersistedSettings(this.storageKeyValue());
    return { ...(stored?.toolStyle || {}) };
  }

  /**
   * Update tool-card style tokens, recompose CSS, and persist by default.
   * Pass null/empty strings to clear individual fields.
   */
  setToolStyle(
    style: ToolStyleOverrides | null | undefined,
    opts?: { persist?: boolean; replace?: boolean },
  ): ToolStyleOverrides {
    const incoming = style || {};
    const base: ToolStyleOverrides = opts?.replace ? {} : { ...this.getToolStyle() };
    const next: ToolStyleOverrides = { ...base };
    for (const key of ['bg', 'border', 'radius', 'fontSize'] as const) {
      if (key in incoming) {
        const v = (incoming[key] || '').trim();
        if (v) next[key] = v;
        else delete next[key];
      }
    }
    this._toolStyle = next;
    if (opts?.persist !== false) this.persistThemeState();
    this.rebuildThemeLayers();
    return { ...this._toolStyle };
  }

  /** Snapshot of themeId + toolStyle for host tools / debugging. */
  getUiStyle(): { themeId: string; toolStyle: ToolStyleOverrides } {
    return {
      themeId: this.resolveActiveThemeId(),
      toolStyle: this.getToolStyle(),
    };
  }

  private persistThemeState(): void {
    const stored = loadPersistedSettings(this.storageKeyValue()) || {};
    savePersistedSettings(this.storageKeyValue(), {
      ...stored,
      themeId: this.resolveActiveThemeId(),
      toolStyle: this.getToolStyle(),
      rememberKey: stored.rememberKey === true,
      apiKey: stored.rememberKey ? stored.apiKey : undefined,
    });
  }

  get open(): boolean {
    const v = this.getAttribute('open');
    if (v === null) return false;
    return v !== 'false' && v !== '0';
  }
  set open(v: boolean) {
    if (v) this.setAttribute('open', '');
    else this.removeAttribute('open');
    this.applyLayout();
  }

  setConfig(cfg: Partial<SimpleChatConfig>): void {
    if (cfg.apiKey != null) this._apiKey = cfg.apiKey;
    if (cfg.systemPrompt != null) this._systemPrompt = cfg.systemPrompt;
    if (cfg.provider != null && isChatProviderId(cfg.provider)) {
      this._provider = cfg.provider;
    }
    // Host may also set api-base-url / model attributes; merge non-empty into engine.
    this.ensureEngine();
    const resolved = this.resolveConfig();
    this.engine?.updateConfig({
      ...resolved,
      ...Object.fromEntries(
        Object.entries(cfg).filter(([, v]) => v != null && String(v).trim() !== ''),
      ),
    });
  }

  registerTool(tool: HostTool): void {
    this.ensureEngine();
    this.engine!.registerTool(tool);
  }

  unregisterTool(name: string): void {
    this.engine?.unregisterTool(name);
  }

  /**
   * Host override CSS appended after theme pack + tool overrides.
   * Prefer setTheme / theme-id for packs; use this for one-off token overrides.
   */
  applyThemeCss(css: string): void {
    // Keep full CSS in memory — do NOT mirror multiline CSS into the theme-css
    // attribute (browsers/Vue attribute sync mangle newlines and break apply).
    this._hostThemeCss = normalizeHostThemeCss(css || '');
    this.suppressAttrSync = true;
    try {
      if (this._hostThemeCss) this.setAttribute('data-theme-css', '1');
      else this.removeAttribute('data-theme-css');
      // Clear any stale short attribute so it cannot overwrite memory on change.
      this.removeAttribute('theme-css');
    } finally {
      this.suppressAttrSync = false;
    }
    this.rebuildThemeLayers();
  }

  /**
   * Host can append a custom section into the settings drawer (e.g. Built-in AI status).
   * Pass null to clear. Survives re-open; re-attached after renderShell if needed.
   */
  setHostSettingsSlot(el: HTMLElement | null): void {
    this.hostSettingsNode = el;
    this.attachHostSettingsSlot();
  }

  /** Focus the composer textarea (host may call after opening the panel). */
  focusComposer(): void {
    this.textarea?.focus();
  }

  /**
   * Stop key events from bubbling to the host document (e.g. Excalidraw
   * shortcuts). Capture+bubble on composer and settings inputs.
   */
  private isolateKeyboard(el: HTMLElement | null | undefined): void {
    if (!el) return;
    const stop = (e: Event) => {
      e.stopPropagation();
    };
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      el.addEventListener(type, stop);
    }
  }

  private wireKeyboardIsolation(): void {
    this.isolateKeyboard(this.textarea);
    if (!this.settingsEl) return;
    const fields = this.settingsEl.querySelectorAll(
      'input, textarea, select, [contenteditable="true"]',
    );
    fields.forEach((el) => this.isolateKeyboard(el as HTMLElement));
  }

  private attachHostSettingsSlot(): void {
    const slot =
      this.hostSettingsSlotEl ||
      (this.settingsEl?.querySelector('[data-host-settings]') as HTMLElement | null);
    if (!slot) return;
    this.hostSettingsSlotEl = slot;
    slot.replaceChildren();
    if (this.hostSettingsNode) {
      slot.appendChild(this.hostSettingsNode);
      slot.hidden = false;
    } else {
      slot.hidden = true;
    }
  }

  private resolveActiveThemeId(): string {
    const stored = loadPersistedSettings(this.storageKeyValue());
    return resolveThemeId({
      hostThemeId: this._themeId || this.getAttribute('theme-id'),
      persistedThemeId: stored?.themeId,
    });
  }

  /** Layers: base styles → theme pack → tool overrides → host themeCss. */
  private rebuildThemeLayers(): void {
    if (!this.styleEl) return;
    const stored = loadPersistedSettings(this.storageKeyValue());
    const themeId = this.resolveActiveThemeId();
    const toolStyle = Object.keys(this._toolStyle).length
      ? this._toolStyle
      : stored?.toolStyle || {};
    const layered = composeThemeCss({
      themeId,
      toolStyle,
      hostThemeCss: this._hostThemeCss || this.getAttribute('theme-css') || '',
    });
    this.styleEl.textContent = defaultStyles + '\n' + layered;
  }

  private storageKeyValue(): string {
    return this.getAttribute('storage-key') || 'simplechat';
  }

  /** Raw host attrs/props (may be empty). */
  private hostConfigFromAttrs(): Pick<
    SimpleChatConfig,
    'apiBaseUrl' | 'apiKey' | 'model' | 'systemPrompt' | 'provider'
  > {
    const attrProvider = this.getAttribute('provider') || '';
    const provider =
      (isChatProviderId(this._provider) ? this._provider : undefined) ||
      (isChatProviderId(attrProvider) ? attrProvider : undefined);
    return {
      apiBaseUrl: this.getAttribute('api-base-url') || '',
      apiKey: this._apiKey,
      model: this.getAttribute('model') || '',
      // Prefer explicit property, then attribute (do not invent from storage here).
      systemPrompt: this._systemPrompt || this.getAttribute('system-prompt') || '',
      provider,
    };
  }

  /**
   * Effective config: non-empty host > localStorage > env > empty.
   * Fills in-memory gaps for apiKey / systemPrompt without writing attributes
   * (setAttribute would re-enter attributeChangedCallback).
   */
  private resolveConfig(): SimpleChatConfig {
    const host = this.hostConfigFromAttrs();
    const stored = loadPersistedSettings(this.storageKeyValue());
    const env = readEnvDefaults();
    const merged = mergeConfigPriority({ host, stored, env });
    this.settingsRememberKey = merged.rememberKey;

    if (!String(host.apiKey || '').trim() && merged.apiKey) {
      this._apiKey = merged.apiKey;
    }
    if (!String(host.systemPrompt || '').trim() && merged.systemPrompt) {
      this._systemPrompt = merged.systemPrompt;
    }

    if (!this._provider && merged.provider) {
      this._provider = merged.provider;
    }

    return {
      apiBaseUrl: merged.apiBaseUrl,
      apiKey: this._apiKey || merged.apiKey,
      model: merged.model,
      systemPrompt: this._systemPrompt || merged.systemPrompt || undefined,
      provider: (isChatProviderId(this._provider) ? this._provider : undefined) || merged.provider,
    };
  }

  private ensureEngine(force = false): void {
    const storageKey = this.storageKeyValue();
    if (!this.engine || force) {
      // Drop previous engine listeners when recreating
      for (const u of this.unbound) u();
      this.unbound = [];
      this.engine?.stop();
      const store =
        typeof indexedDB !== 'undefined'
          ? indexedDbStore(storageKey)
          : new MemoryStore();
      const prevTools = this.engine?.tools.list() ?? [];
      this.engine = new ChatEngine({
        config: this.resolveConfig(),
        store,
      });
      for (const t of prevTools) this.engine.registerTool(t);
      const off = this.engine.on((ev) => {
        if (ev.type === 'text-delta') {
          const msg = this.messages.find((m) => m.id === ev.messageId);
          if (msg) {
            msg.content += ev.delta;
            this.renderMessages();
          }
        } else if (ev.type === 'message') {
          const idx = this.messages.findIndex((m) => m.id === ev.message.id);
          if (idx >= 0) {
            const prev = this.messages[idx];
            // Avoid clobbering streamed text with an empty placeholder snapshot
            if (
              ev.message.status === 'streaming' &&
              !ev.message.content &&
              prev.content
            ) {
              this.messages[idx] = { ...ev.message, content: prev.content };
            } else {
              this.messages[idx] = ev.message;
            }
          } else this.messages.push(ev.message);
          if (ev.message.toolCalls) {
            for (const tc of ev.message.toolCalls) {
              this.pendingTools.set(tc.id, {
                name: tc.name,
                args: tc.arguments,
                status: 'pending',
              });
            }
          }
          this.renderMessages();
        } else if (ev.type === 'tool-call') {
          this.pendingTools.set(ev.toolCall.id, {
            name: ev.toolCall.name,
            args: ev.toolCall.arguments,
            status: 'pending',
          });
          this.renderMessages();
        } else if (ev.type === 'tool-result') {
          const p = this.pendingTools.get(ev.toolCallId);
          if (p) {
            p.status = ev.error ? 'error' : 'done';
            p.result = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result);
          }
          this.renderMessages();
        } else if (ev.type === 'done') {
          this.streaming = false;
          this.updateSendBtn();
          void this.loadThreads();
        } else if (ev.type === 'error') {
          this.streaming = false;
          this.errorText = ev.error.message;
          this.updateSendBtn();
          this.renderError();
        } else if (ev.type === 'thread') {
          void this.loadThreads();
        }
      });
      this.unbound.push(off);
    } else {
      this.engine.updateConfig(this.resolveConfig());
    }
  }

  private async refresh(): Promise<void> {
    await this.loadThreads();
    if (this.engine?.currentThreadId) {
      this.messages = await this.engine.getMessages(this.engine.currentThreadId);
    } else if (this.threads[0]) {
      await this.engine!.selectThread(this.threads[0].id);
      this.messages = await this.engine!.getMessages(this.threads[0].id);
    } else {
      this.messages = [];
    }
    this.renderMessages();
    this.renderThreads();
    this.updateThreadName();
  }

  private async loadThreads(): Promise<void> {
    if (!this.engine) return;
    this.threads = await this.engine.listThreads();
    this.renderThreads();
    this.updateThreadName();
  }

  private renderShell(): void {
    this.shadow.innerHTML = '';
    this.styleEl = document.createElement('style');
    this._hostThemeCss = normalizeHostThemeCss(this.getAttribute('theme-css') || this._hostThemeCss || '');
    this._themeId = this.getAttribute('theme-id') || this._themeId || '';
    const storedInit = loadPersistedSettings(this.getAttribute('storage-key') || 'simplechat');
    if (storedInit?.toolStyle) this._toolStyle = { ...storedInit.toolStyle };
    this.shadow.appendChild(this.styleEl);
    this.rebuildThemeLayers();

    this.rootEl = document.createElement('div');
    this.rootEl.className = 'sc-root';
    this.rootEl.innerHTML = `
      <div class="sc-header">
        <div class="sc-title">SimpleChat</div>
        <div class="sc-header-actions">
          <button type="button" class="sc-icon-btn" data-act="new" title="新会话" aria-label="新会话">+</button>
          <button type="button" class="sc-icon-btn" data-act="threads" title="会话" aria-label="会话">≡</button>
          <a class="sc-icon-btn sc-github-link" href="https://github.com/SimpleAI2026/SimpleChat" target="_blank" rel="noopener" title="开源仓库" aria-label="开源仓库 GitHub"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg></a>
          <button type="button" class="sc-icon-btn" data-act="settings" title="设置" aria-label="设置">⚙</button>
          <button type="button" class="sc-icon-btn" data-act="close" title="关闭" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="sc-thread-name"></div>
      <div class="sc-body">
        <div class="sc-thread-drawer" hidden>
          <div class="sc-thread-drawer-head">
            <span>会话</span>
            <button type="button" class="sc-icon-btn" data-act="new" title="新建" aria-label="新建">+</button>
          </div>
          <div class="sc-thread-list"></div>
          <div class="sc-thread-footer">
            <button type="button" class="sc-danger" data-act="delete">删除当前会话</button>
          </div>
        </div>
        <div class="sc-main">
        <div class="sc-settings-drawer" hidden>
          <div class="sc-settings-drawer-head">
            <span>设置</span>
            <div class="sc-settings-drawer-actions">
              <button type="button" class="sc-btn-primary sc-settings-save-btn" data-act="settings-save" title="保存" aria-label="保存">保存</button>
              <button type="button" class="sc-icon-btn" data-act="settings-close" title="关闭设置" aria-label="关闭设置">×</button>
            </div>
          </div>
          <div class="sc-settings-form">
            <div class="sc-section-title">模型提供方</div>
            <div class="sc-provider-grid" role="radiogroup" aria-label="模型提供方">
              <label class="sc-theme-option">
                <input type="radio" name="sc-provider" data-field="provider" value="openai" />
                <span>OpenAI 兼容（云端）</span>
              </label>
              <label class="sc-theme-option">
                <input type="radio" name="sc-provider" data-field="provider" value="chrome-ai" />
                <span>Chrome 内置 AI（Gemini Nano）</span>
              </label>
            </div>
            <div class="sc-chrome-ai-panel" data-chrome-ai-panel hidden>
              <p class="sc-builtin-ai-title">Gemini Nano 状态</p>
              <div class="sc-builtin-ai-status">
                <span class="sc-builtin-ai-dot" data-chrome-ai-dot aria-hidden="true"></span>
                <span data-chrome-ai-label>检测中…</span>
              </div>
              <div class="sc-builtin-ai-progress" data-chrome-ai-progress hidden></div>
              <p class="sc-builtin-ai-hint" data-chrome-ai-hint>需 Chrome 148+（网页）或 138+（扩展）且启用 Prompt API。Nano 路径不支持工具调用（工具需云端）。</p>
              <p class="sc-builtin-ai-hint sc-tools-warn" data-chrome-ai-tools-warn hidden>已注册宿主工具：当前为 Nano，发送时将跳过工具（工具需云端 OpenAI 兼容通道）。</p>
              <div class="sc-builtin-ai-actions">
                <button type="button" class="sc-btn-ghost" data-act="chrome-ai-detect">重新检测</button>
                <button type="button" class="sc-btn-primary" data-act="chrome-ai-download" hidden>下载模型</button>
              </div>
            </div>
            <div class="sc-openai-fields" data-openai-fields>
            <label class="sc-field">
              <span class="sc-field-label">Base URL</span>
              <input type="url" data-field="apiBaseUrl" placeholder="https://api.openai.com/v1" autocomplete="off" spellcheck="false" />
            </label>
            <label class="sc-field">
              <span class="sc-field-label">API Key</span>
              <input type="password" data-field="apiKey" placeholder="sk-…" autocomplete="off" spellcheck="false" />
            </label>
            <label class="sc-field sc-field-check">
              <input type="checkbox" data-field="rememberKey" />
              <span>记住 API Key</span>
            </label>
            <label class="sc-field">
              <span class="sc-field-label">Model</span>
              <input type="text" data-field="model" placeholder="zai-org/GLM-5.3-Flash" autocomplete="off" spellcheck="false" />
            </label>
            </div>
            <label class="sc-field">
              <span class="sc-field-label">系统提示词</span>
              <textarea data-field="systemPrompt" rows="4" placeholder="可选：系统提示词" spellcheck="false"></textarea>
            </label>
            <div class="sc-section-title">主题</div>
            <div class="sc-theme-grid" data-field="themeGrid" role="radiogroup" aria-label="主题"></div>
            <div class="sc-section-title">工具样式</div>
            <p class="sc-settings-hint" style="margin-top:0">修改 registerTool 工具卡片在对话中的外观（保存后生效）。</p>
            <div class="sc-field-row">
              <label class="sc-field">
                <span class="sc-field-label">背景色</span>
                <input type="color" data-field="toolBg" />
              </label>
              <label class="sc-field">
                <span class="sc-field-label">边框色</span>
                <input type="color" data-field="toolBorder" />
              </label>
            </div>
            <div class="sc-field-row">
              <label class="sc-field">
                <span class="sc-field-label">圆角</span>
                <input type="text" data-field="toolRadius" placeholder="8px" autocomplete="off" />
              </label>
              <label class="sc-field">
                <span class="sc-field-label">字号</span>
                <input type="text" data-field="toolFontSize" placeholder="12px" autocomplete="off" />
              </label>
            </div>
            <div class="sc-host-settings-slot" data-host-settings hidden></div>
            <p class="sc-settings-hint">Base URL 不要包含 <code>/chat/completions</code>。勾选「记住 API Key」会写入本机 localStorage，存在 XSS 泄露风险。宿主 themeCss / themeStyle 仍可覆盖主题。</p>
          </div>
        </div>
        <div class="sc-error" hidden></div>
        <div class="sc-messages"></div>
      <div class="sc-composer">
        <div class="sc-composer-card">
          <textarea rows="2" placeholder="输入消息…" aria-label="消息输入"></textarea>
          <div class="sc-composer-footer">
            <div class="sc-hint">Enter 发送 · Shift+Enter 换行</div>
            <button type="button" class="sc-send">发送</button>
          </div>
        </div>
      </div>
        </div>
      </div>
    `;
    this.shadow.appendChild(this.rootEl);

    this.messagesEl = this.rootEl.querySelector('.sc-messages')!;
    // Must scope to composer — settings drawer also has a <textarea> (systemPrompt).
    this.textarea = this.rootEl.querySelector('.sc-composer textarea')!;
    this.sendBtn = this.rootEl.querySelector('.sc-composer .sc-send')!;
    this.threadNameEl = this.rootEl.querySelector('.sc-thread-name')!;
    this.drawerEl = this.rootEl.querySelector('.sc-thread-drawer')!;
    this.settingsEl = this.rootEl.querySelector('.sc-settings-drawer')!;
    this.hostSettingsSlotEl = this.settingsEl.querySelector(
      '[data-host-settings]',
    ) as HTMLElement | null;
    this.attachHostSettingsSlot();
    this.errorEl = this.rootEl.querySelector('.sc-error')!;

    this.rootEl.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'new') void this.newThread();
      if (act === 'threads') {
        this.toggleThreads();
      }
      if (act === 'settings') {
        this.toggleSettings();
      }
      if (act === 'settings-close') {
        this.closeSettings(false);
      }
      if (act === 'settings-save') {
        this.saveSettings();
      }
      if (act === 'chrome-ai-detect') {
        void this.refreshChromeAiStatus();
      }
      if (act === 'chrome-ai-download') {
        void this.downloadChromeAiModel();
      }
      if (act === 'close') {
        if (this.isExtensionLayout()) return;
        this.open = false;
        this.dispatchEvent(new CustomEvent('sc-close', { bubbles: true, composed: true }));
      }
      if (act === 'delete') void this.deleteCurrent();
    });

    this.sendBtn.addEventListener('click', () => {
      if (this.streaming) {
        this.engine?.stop();
        this.streaming = false;
        this.updateSendBtn();
      } else {
        void this.handleSend();
      }
    });

    this.textarea.addEventListener('keydown', (e) => {
      // Isolation also via wireKeyboardIsolation; keep Enter→send / Shift+Enter newline.
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.streaming) void this.handleSend();
      }
    });
    this.wireKeyboardIsolation();

    // Provider radio toggles Nano / OpenAI panels
    this.settingsEl.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t?.matches?.('input[data-field="provider"]')) {
        this.applyProviderPanelVisibility(t.value as ChatProviderId);
      }
    });

    this.ensureResizeHandle();
    this.applyPanelWidth(loadSidebarWidth(), { persist: false, emit: true });
    this.applyLayout();
  }

  /** Current sidebar / panel width in px. */
  getWidth(): number {
    return this.panelWidth;
  }

  /** Set sidebar / panel width (clamped), persist by default, emit sc-resize. */
  setWidth(width: number, opts?: { persist?: boolean; emit?: boolean }): number {
    return this.applyPanelWidth(width, {
      persist: opts?.persist !== false,
      emit: opts?.emit !== false,
    });
  }

  private ensureResizeHandle(): void {
    if (!this.rootEl) return;
    let handle = this.rootEl.querySelector('.sc-resize-handle') as HTMLElement | null;
    if (!handle) {
      handle = document.createElement('div');
      handle.className = 'sc-resize-handle';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', '调整宽度');
      handle.title = '拖动调整宽度';
      this.rootEl.appendChild(handle);
      handle.addEventListener('pointerdown', (e) => this.onResizePointerDown(e));
    }
    this.resizeHandleEl = handle;
    this.syncResizeHandleSide();
  }

  private syncResizeHandleSide(): void {
    if (!this.resizeHandleEl || !this.rootEl) return;
    const layout = this.getAttribute('layout') || 'sidebar';
    const pos = this.getAttribute('position') || 'right';
    // Right sidebar / panel: handle on left edge. Left sidebar: handle on right edge.
    const onStart = layout === 'panel' || pos !== 'left';
    this.resizeHandleEl.dataset.edge = onStart ? 'start' : 'end';
  }

  private onResizePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = this.resizeHandleEl;
    if (!handle) return;
    this.resizing = true;
    handle.dataset.active = 'true';
    handle.setPointerCapture?.(e.pointerId);
    const layout = this.getAttribute('layout') || 'sidebar';
    const pos = this.getAttribute('position') || 'right';
    const fromRight = layout === 'panel' || pos !== 'left';
    const onMove = (ev: PointerEvent) => {
      if (!this.resizing) return;
      const next = fromRight ? window.innerWidth - ev.clientX : ev.clientX;
      this.applyPanelWidth(next, { persist: false, emit: true });
    };
    const onUp = (ev: PointerEvent) => {
      this.resizing = false;
      handle.dataset.active = 'false';
      try {
        handle.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.applyPanelWidth(this.panelWidth, { persist: true, emit: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  private applyPanelWidth(
    width: number,
    opts?: { persist?: boolean; emit?: boolean },
  ): number {
    const next = clampSidebarWidth(width);
    this.panelWidth = next;
    this.style.setProperty('--sc-width', `${next}px`);
    if (this.rootEl) {
      this.rootEl.style.setProperty('--sc-width', `${next}px`);
    }
    if (opts?.persist) saveSidebarWidth(next);
    if (opts?.emit) {
      this.dispatchEvent(
        new CustomEvent('sc-resize', {
          bubbles: true,
          composed: true,
          detail: { width: next },
        }),
      );
    }
    return next;
  }

  private isExtensionLayout(): boolean {
    return (this.getAttribute('layout') || '') === 'extension';
  }

  private applyLayout(): void {
    if (!this.rootEl) return;
    const layout = this.getAttribute('layout') || 'sidebar';
    this.rootEl.dataset.layout = layout;
    // Only sidebar uses open/closed hide; extension stays full-page (default open).
    const closed = !this.open && layout === 'sidebar';
    this.rootEl.dataset.closed = closed ? 'true' : 'false';
    const pos = this.getAttribute('position') || 'right';
    if (layout === 'sidebar') {
      if (pos === 'left') {
        this.rootEl.style.insetInlineEnd = 'auto';
        this.rootEl.style.insetInlineStart = '0';
        this.rootEl.style.borderLeft = 'none';
        this.rootEl.style.borderRight = '1px solid var(--sc-border)';
      } else {
        this.rootEl.style.insetInlineEnd = '0';
        this.rootEl.style.insetInlineStart = 'auto';
        this.rootEl.style.borderLeft = '1px solid var(--sc-border)';
        this.rootEl.style.borderRight = 'none';
      }
    } else {
      this.rootEl.style.insetInlineEnd = '';
      this.rootEl.style.insetInlineStart = '';
      this.rootEl.style.borderLeft = '';
      this.rootEl.style.borderRight = '';
    }
    if (layout === 'extension') {
      // Persistent left thread rail (not full-screen overlay by default).
      this.showThreads = true;
      if (this.drawerEl) this.drawerEl.hidden = false;
      if (this.resizeHandleEl) this.resizeHandleEl.hidden = true;
    } else if (this.resizeHandleEl) {
      this.resizeHandleEl.hidden = false;
    }
    this.syncResizeHandleSide();
  }

  private updateSendBtn(): void {
    if (!this.sendBtn) return;
    if (this.streaming) {
      this.sendBtn.textContent = '停止';
      this.sendBtn.classList.add('stop');
    } else {
      this.sendBtn.textContent = '发送';
      this.sendBtn.classList.remove('stop');
    }
  }

  private updateThreadName(): void {
    if (!this.threadNameEl || !this.engine) return;
    const t = this.threads.find((x) => x.id === this.engine!.currentThreadId);
    this.threadNameEl.textContent = t ? t.title : '新会话';
  }

  private renderError(): void {
    if (!this.errorEl) return;
    if (this.errorText) {
      this.errorEl.hidden = false;
      this.errorEl.textContent = this.errorText;
    } else {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }
  }

  private renderMessages(): void {
    if (!this.messagesEl) return;
    const visible = this.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    if (!visible.length && !this.pendingTools.size) {
      this.messagesEl.innerHTML = `<div class="sc-empty"><div class="sc-empty-title">开始对话</div><div class="sc-empty-sub">问点什么，或让我改画布</div></div>`;
      return;
    }

    const parts: string[] = [];
    for (const m of this.messages) {
      if (m.role === 'user') {
        parts.push(
          `<div class="sc-msg user"><div class="sc-bubble">${escapeHtml(m.content)}</div></div>`,
        );
      } else if (m.role === 'assistant') {
        const prose =
          m.content?.trim() ||
          (m.status === 'streaming' && !m.toolCalls?.length ? '…' : '');
        const chunks: string[] = [];
        if (prose) {
          chunks.push(`<div class="sc-bubble">${renderMarkdown(prose)}</div>`);
        }
        if (m.toolCalls?.length) {
          chunks.push('<div class="sc-tools">');
          for (const tc of m.toolCalls) {
            const st = this.pendingTools.get(tc.id);
            const status = st?.status ?? 'done';
            const mark = status === 'done' ? '✓' : status === 'error' ? '!' : '…';
            const argsText = truncate(tc.arguments || '{}', 160);
            const resultText =
              st?.result != null ? truncate(st.result, 160) : '';
            chunks.push(
              `<div class="sc-tool-card" data-status="${status}">` +
                `<div class="sc-tool-head">` +
                `<span class="sc-tool-name"><span class="sc-tool-dot" data-status="${status}"></span>${escapeHtml(tc.name)}</span>` +
                `<span class="sc-tool-status">${mark}</span>` +
                `</div>` +
                `<div class="sc-tool-section"><div class="sc-tool-label">参数</div><div class="sc-tool-args">${escapeHtml(argsText)}</div></div>` +
                (resultText
                  ? `<div class="sc-tool-section"><div class="sc-tool-label">结果</div><div class="sc-tool-args">${escapeHtml(resultText)}</div></div>`
                  : '') +
                `</div>`,
            );
          }
          chunks.push('</div>');
        }
        if (!chunks.length && m.status === 'streaming') {
          chunks.push(`<div class="sc-bubble">…</div>`);
        }
        parts.push(`<div class="sc-msg assistant">${chunks.join('')}</div>`);
      }
    }
    this.messagesEl.innerHTML = parts.join('');
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderThreads(): void {
    const list = this.drawerEl?.querySelector('.sc-thread-list');
    if (!list || !this.engine) return;
    list.innerHTML = this.threads
      .map((t) => {
        const active = t.id === this.engine!.currentThreadId ? 'active' : '';
        return `<button type="button" class="sc-thread-item ${active}" data-thread="${t.id}">
          <div class="sc-thread-item-title">${escapeHtml(t.title)}</div>
          <div class="sc-thread-item-meta">${escapeHtml(formatTime(t.updatedAt))}</div>
        </button>`;
      })
      .join('');
    list.querySelectorAll('[data-thread]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.thread!;
        void this.selectThread(id);
      });
    });
  }

  private toggleThreads(): void {
    this.showThreads = !this.showThreads;
    this.drawerEl.hidden = !this.showThreads;
    if (this.showThreads) this.closeSettings(false);
  }

  private toggleSettings(): void {
    if (this.showSettings) {
      this.closeSettings(false);
      return;
    }
    this.openSettings();
  }

  private openSettings(): void {
    if (!this.isExtensionLayout()) {
      this.showThreads = false;
      this.drawerEl.hidden = true;
    }
    this.showSettings = true;
    this.settingsEl.hidden = false;
    this.fillSettingsForm();
    this.wireKeyboardIsolation();
    void this.refreshChromeAiStatus();
  }

  private closeSettings(_apply: boolean): void {
    this.showSettings = false;
    if (this.settingsEl) this.settingsEl.hidden = true;
  }

  private fillSettingsForm(): void {
    const cfg = this.resolveConfig();
    const stored = loadPersistedSettings(this.storageKeyValue());
    const env = readEnvDefaults();
    const base = this.querySettingsInput('apiBaseUrl');
    const key = this.querySettingsInput('apiKey');
    const model = this.querySettingsInput('model');
    const prompt = this.querySettingsTextarea('systemPrompt');
    const remember = this.settingsEl.querySelector(
      '[data-field="rememberKey"]',
    ) as HTMLInputElement | null;

    if (base) {
      base.value = cfg.apiBaseUrl || stored?.apiBaseUrl || env.apiBaseUrl || '';
    }
    if (key) {
      key.value =
        cfg.apiKey ||
        (stored?.rememberKey ? stored.apiKey || '' : '') ||
        env.apiKey ||
        '';
    }
    if (model) {
      model.value = cfg.model || stored?.model || env.model || DEFAULT_MODEL;
    }
    if (prompt) {
      prompt.value = cfg.systemPrompt || stored?.systemPrompt || '';
    }
    if (remember) {
      remember.checked = stored == null ? true : stored.rememberKey === true;
    }

    const provider =
      (isChatProviderId(cfg.provider) ? cfg.provider : null) ||
      (isChatProviderId(stored?.provider) ? stored!.provider! : null) ||
      'openai';
    this.settingsEl
      .querySelectorAll('input[data-field="provider"]')
      .forEach((el) => {
        const input = el as HTMLInputElement;
        input.checked = input.value === provider;
      });
    this.applyProviderPanelVisibility(provider);

    const themeId = this.resolveActiveThemeId();
    this.renderThemeOptions(themeId);

    const pack = getTheme(themeId);
    const overrides: ToolStyleOverrides = {
      ...(stored?.toolStyle || {}),
      ...this._toolStyle,
    };
    const toolBg = this.querySettingsInput('toolBg');
    const toolBorder = this.querySettingsInput('toolBorder');
    const toolRadius = this.querySettingsInput('toolRadius');
    const toolFontSize = this.querySettingsInput('toolFontSize');
    if (toolBg) toolBg.value = toColorInput(overrides.bg || pack.tokens.toolBg);
    if (toolBorder) toolBorder.value = toColorInput(overrides.border || pack.tokens.toolBorder);
    if (toolRadius) toolRadius.value = (overrides.radius || pack.tokens.toolRadius || '').trim();
    if (toolFontSize) toolFontSize.value = (overrides.fontSize || pack.tokens.toolFontSize || '').trim();
  }

  private renderThemeOptions(selectedId: string): void {
    const grid = this.settingsEl?.querySelector('[data-field="themeGrid"]');
    if (!grid) return;
    grid.innerHTML = listThemes()
      .map((t) => {
        const checked = t.id === selectedId ? 'checked' : '';
        return (
          `<label class="sc-theme-option" style="--sw1:${t.swatch[0]};--sw2:${t.swatch[1]}">` +
          `<input type="radio" name="sc-theme" data-field="themeId" value="${t.id}" ${checked} />` +
          `<span class="sc-theme-swatch" aria-hidden="true"></span>` +
          `<span>${escapeHtml(t.label)}</span>` +
          `</label>`
        );
      })
      .join('');
  }

  private querySettingsInput(field: string): HTMLInputElement | null {
    return this.settingsEl?.querySelector(
      `input[data-field="${field}"]`,
    ) as HTMLInputElement | null;
  }

  private querySettingsTextarea(field: string): HTMLTextAreaElement | null {
    return this.settingsEl?.querySelector(
      `textarea[data-field="${field}"]`,
    ) as HTMLTextAreaElement | null;
  }

  private saveSettings(): void {
    const base = (this.querySettingsInput('apiBaseUrl')?.value || '').trim().replace(/\/+$/, '');
    const apiKey = (this.querySettingsInput('apiKey')?.value || '').trim();
    const model = (this.querySettingsInput('model')?.value || '').trim();
    const systemPrompt = (this.querySettingsTextarea('systemPrompt')?.value || '').trim();
    const rememberEl = this.settingsEl.querySelector(
      '[data-field="rememberKey"]',
    ) as HTMLInputElement | null;
    const rememberKey = !!rememberEl?.checked;
    const providerChecked = this.settingsEl.querySelector(
      'input[data-field="provider"]:checked',
    ) as HTMLInputElement | null;
    const provider: ChatProviderId = isChatProviderId(providerChecked?.value)
      ? providerChecked!.value
      : 'openai';
    const themeChecked = this.settingsEl.querySelector(
      'input[data-field="themeId"]:checked',
    ) as HTMLInputElement | null;
    const themeId = (themeChecked?.value || this.resolveActiveThemeId()).trim() || DEFAULT_THEME_ID;

    const toolStyle: ToolStyleOverrides = {
      bg: (this.querySettingsInput('toolBg')?.value || '').trim() || undefined,
      border: (this.querySettingsInput('toolBorder')?.value || '').trim() || undefined,
      radius: (this.querySettingsInput('toolRadius')?.value || '').trim() || undefined,
      fontSize: (this.querySettingsInput('toolFontSize')?.value || '').trim() || undefined,
    };

    const toSave: PersistedSettings = {
      apiBaseUrl: base,
      model,
      systemPrompt,
      rememberKey,
      apiKey: rememberKey ? apiKey : undefined,
      themeId,
      toolStyle,
      provider,
    };
    savePersistedSettings(this.storageKeyValue(), toSave);
    this.settingsRememberKey = rememberKey;
    this._toolStyle = { ...toolStyle };
    this._themeId = themeId;

    this.suppressAttrSync = true;
    try {
      if (base) this.setAttribute('api-base-url', base);
      else this.removeAttribute('api-base-url');
      if (model) this.setAttribute('model', model);
      else this.removeAttribute('model');
      // Keep systemPrompt in memory / engine only (do not write multiline attribute).
      this.removeAttribute('system-prompt');
      this.setAttribute('theme-id', themeId);
    } finally {
      this.suppressAttrSync = false;
    }
    this._apiKey = apiKey;
    this._systemPrompt = systemPrompt;
    this._provider = provider;

    this.ensureEngine();
    this.engine?.updateConfig({
      apiBaseUrl: base,
      apiKey,
      model,
      systemPrompt,
      provider,
    });
    this.rebuildThemeLayers();

    this.errorText = '';
    this.renderError();
    this.closeSettings(true);
    this.dispatchEvent(
      new CustomEvent('sc-settings', {
        bubbles: true,
        composed: true,
        detail: { apiBaseUrl: base, model, systemPrompt, rememberKey, themeId, toolStyle, provider },
      }),
    );
  }

  private async newThread(): Promise<void> {
    this.ensureEngine();
    this.pendingTools.clear();
    this.errorText = '';
    this.renderError();
    await this.engine!.createThread();
    this.messages = [];
    if (this.isExtensionLayout()) {
      this.showThreads = true;
      this.drawerEl.hidden = false;
    } else {
      this.showThreads = false;
      this.drawerEl.hidden = true;
    }
    this.closeSettings(false);
    this.renderMessages();
    await this.loadThreads();
  }

  private async selectThread(id: string): Promise<void> {
    await this.engine!.selectThread(id);
    this.messages = await this.engine!.getMessages(id);
    this.pendingTools.clear();
    if (this.isExtensionLayout()) {
      this.showThreads = true;
      this.drawerEl.hidden = false;
    } else {
      this.showThreads = false;
      this.drawerEl.hidden = true;
    }
    this.closeSettings(false);
    this.renderMessages();
    this.renderThreads();
    this.updateThreadName();
  }

  private async deleteCurrent(): Promise<void> {
    if (!this.engine?.currentThreadId) return;
    await this.engine.deleteThread(this.engine.currentThreadId);
    this.messages = [];
    this.pendingTools.clear();
    await this.loadThreads();
    if (this.threads[0]) await this.selectThread(this.threads[0].id);
    else {
      this.renderMessages();
      this.updateThreadName();
    }
  }

  private async handleSend(): Promise<void> {
    const text = this.textarea.value.trim();
    if (!text || this.streaming) return;
    this.ensureEngine();
    const cfg = this.resolveConfig();
    const provider = cfg.provider || 'openai';

    if (provider === 'chrome-ai') {
      const avail = await checkChromeAiAvailability();
      this.chromeAiStatus = avail.status;
      this.syncChromeAiPanel();
      if (avail.status !== CHROME_AI_STATUS.AVAILABLE) {
        if (avail.status === CHROME_AI_STATUS.DOWNLOADABLE) {
          this.errorText =
            'Gemini Nano 尚未下载。请打开 ⚙ 设置 → 下载模型，或改用 OpenAI 兼容云端。';
        } else if (avail.status === CHROME_AI_STATUS.DOWNLOADING) {
          this.errorText = 'Gemini Nano 正在下载，请稍候再发送。';
        } else {
          this.errorText =
            'Chrome 内置 AI 不可用（需 Chrome 148+ 网页 / 138+ 扩展，并启用 Prompt API）。可改用 OpenAI 兼容云端。';
        }
        this.renderError();
        return;
      }
      this.engine?.updateConfig({ ...cfg, provider: 'chrome-ai' });
    } else if (!cfg.apiBaseUrl || !cfg.apiKey || !cfg.model) {
      this.errorText = '请先配置 API Base URL、API Key 与 Model';
      this.renderError();
      return;
    } else {
      this.engine?.updateConfig({ ...cfg, provider: 'openai' });
    }

    this.errorText = '';
    this.renderError();
    this.textarea.value = '';
    this.streaming = true;
    this.updateSendBtn();
    for await (const _ of this.engine!.send(text)) {
      /* events handled via on() */
    }
    this.streaming = false;
    this.updateSendBtn();
  }

  private applyProviderPanelVisibility(provider: ChatProviderId): void {
    const nano = this.settingsEl?.querySelector(
      '[data-chrome-ai-panel]',
    ) as HTMLElement | null;
    const openai = this.settingsEl?.querySelector(
      '[data-openai-fields]',
    ) as HTMLElement | null;
    if (nano) nano.hidden = provider !== 'chrome-ai';
    if (openai) openai.hidden = provider === 'chrome-ai';
    const warn = this.settingsEl?.querySelector(
      '[data-chrome-ai-tools-warn]',
    ) as HTMLElement | null;
    if (warn) {
      const hasTools = (this.engine?.tools.list().length ?? 0) > 0;
      warn.hidden = !(provider === 'chrome-ai' && hasTools);
    }
  }

  private syncChromeAiPanel(): void {
    const panel = this.settingsEl?.querySelector('[data-chrome-ai-panel]');
    if (!panel) return;
    const status = this.chromeAiStatus || CHROME_AI_STATUS.UNKNOWN;
    const dot = panel.querySelector('[data-chrome-ai-dot]') as HTMLElement | null;
    const label = panel.querySelector('[data-chrome-ai-label]') as HTMLElement | null;
    const progress = panel.querySelector(
      '[data-chrome-ai-progress]',
    ) as HTMLElement | null;
    const download = panel.querySelector(
      '[data-act="chrome-ai-download"]',
    ) as HTMLButtonElement | null;
    const detect = panel.querySelector(
      '[data-act="chrome-ai-detect"]',
    ) as HTMLButtonElement | null;

    if (dot) dot.className = `sc-builtin-ai-dot status-${status}`;
    const labels: Record<string, string> = {
      unknown: '未知',
      unavailable: '不可用',
      downloadable: '可下载',
      downloading: '下载中',
      available: '可用',
    };
    if (label) {
      label.textContent = this.chromeAiChecking
        ? '检测中…'
        : labels[status] || status;
    }
    if (progress) {
      if (status === CHROME_AI_STATUS.DOWNLOADING || this.chromeAiDownloading) {
        progress.hidden = false;
        progress.textContent = `${Math.round((this.chromeAiProgress || 0) * 100)}%`;
      } else {
        progress.hidden = true;
      }
    }
    if (download) {
      const show =
        status === CHROME_AI_STATUS.DOWNLOADABLE ||
        status === CHROME_AI_STATUS.DOWNLOADING ||
        this.chromeAiDownloading;
      download.hidden = !show;
      download.disabled =
        status === CHROME_AI_STATUS.DOWNLOADING || this.chromeAiDownloading;
    }
    if (detect) detect.disabled = this.chromeAiChecking;
  }

  private async refreshChromeAiStatus(): Promise<void> {
    this.chromeAiChecking = true;
    this.syncChromeAiPanel();
    try {
      const avail = await checkChromeAiAvailability();
      this.chromeAiStatus = avail.status;
    } finally {
      this.chromeAiChecking = false;
      this.syncChromeAiPanel();
    }
  }

  private async downloadChromeAiModel(): Promise<void> {
    this.ensureEngine();
    const provider = this.engine!.getChromeAiProvider();
    this.chromeAiDownloading = true;
    this.chromeAiStatus = CHROME_AI_STATUS.DOWNLOADING;
    this.chromeAiProgress = 0;
    provider.setOnDownloadProgress((loaded) => {
      this.chromeAiProgress = loaded;
      this.syncChromeAiPanel();
    });
    this.syncChromeAiPanel();
    try {
      await provider.ensureSession();
      this.chromeAiStatus = CHROME_AI_STATUS.AVAILABLE;
      this.chromeAiProgress = 1;
    } catch (err) {
      this.chromeAiStatus = CHROME_AI_STATUS.UNAVAILABLE;
      this.errorText =
        err instanceof Error ? err.message : '下载 Gemini Nano 失败';
      this.renderError();
    } finally {
      this.chromeAiDownloading = false;
      this.syncChromeAiPanel();
    }
  }
}

/** Normalize CSS color to #rrggbb for <input type="color">. */
function toColorInput(v: string): string {
  const s = (v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#f5f5f5';
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

declare global {
  interface HTMLElementTagNameMap {
    'simple-chat': SimpleChatElement;
  }
}

if (!customElements.get('simple-chat')) {
  customElements.define('simple-chat', SimpleChatElement);
}
