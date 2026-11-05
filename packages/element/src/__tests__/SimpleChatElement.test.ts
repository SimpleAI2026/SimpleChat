/**
 * Element keyboard isolation + settings UX (happy-dom).
 * E1 typing, E2 stopPropagation, E3 Enter/Shift+Enter, E4 settings editable,
 * E5 setConfig preserves composer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleChatElement } from '../SimpleChatElement.js';

function mount(attrs: Record<string, string> = {}): SimpleChatElement {
  const el = document.createElement('simple-chat') as SimpleChatElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute('storage-key', attrs['storage-key'] || `test-${Math.random().toString(36).slice(2)}`);
  document.body.appendChild(el);
  return el;
}

function composer(el: SimpleChatElement): HTMLTextAreaElement {
  return el.shadowRoot!.querySelector('.sc-composer textarea') as HTMLTextAreaElement;
}

function settingsInput(el: SimpleChatElement, field: string): HTMLInputElement {
  return el.shadowRoot!.querySelector(
    `.sc-settings-drawer input[data-field="${field}"]`,
  ) as HTMLInputElement;
}

const mem = new Map<string, string>();

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  let current = matches;
  const mql = {
    get matches() {
      return current;
    },
    media: '(max-width: 640px)',
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null,
    addEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
      const fn = typeof cb === 'function' ? cb : cb.handleEvent.bind(cb);
      listeners.add(fn as (ev: MediaQueryListEvent) => void);
    },
    removeEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
      const fn = typeof cb === 'function' ? cb : cb.handleEvent.bind(cb);
      listeners.delete(fn as (ev: MediaQueryListEvent) => void);
    },
    addListener: (cb: (ev: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeListener: (cb: (ev: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    dispatchEvent: () => false,
  } as MediaQueryList;
  const matchMediaFn = ((query: string) => {
    // Keep media string updated for realism.
    (mql as { media: string }).media = query;
    return mql;
  }) as typeof window.matchMedia;
  vi.stubGlobal('matchMedia', matchMediaFn);
  // happy-dom keeps its own window.matchMedia — mirror the stub there too.
  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: matchMediaFn,
      });
    } catch {
      (window as Window & { matchMedia: typeof matchMediaFn }).matchMedia = matchMediaFn;
    }
  }
  return {
    mql,
    listenerCount: () => listeners.size,
    setMatches(next: boolean) {
      current = next;
      const ev = { matches: next, media: mql.media } as MediaQueryListEvent;
      for (const cb of [...listeners]) cb(ev);
      mql.onchange?.call(mql, ev);
    },
  };
}

beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  });
  // Default: wide viewport so existing desktop/extension tests keep rail behavior.
  stubMatchMedia(false);
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe('SimpleChatElement keyboard + settings', () => {
  it('E1: composer accepts typing', () => {
    const el = mount({ open: '' });
    const ta = composer(el);
    ta.value = 'hello';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ta.value).toBe('hello');
  });

  it('E2: keydown/keyup/keypress stopPropagation so document listener does not see them', () => {
    const el = mount({ open: '' });
    const ta = composer(el);
    ta.focus();
    const seen: string[] = [];
    const onDoc = (e: Event) => {
      seen.push(e.type);
    };
    document.addEventListener('keydown', onDoc);
    document.addEventListener('keyup', onDoc);
    document.addEventListener('keypress', onDoc);
    try {
      for (const type of ['keydown', 'keyup', 'keypress'] as const) {
        const ev = new KeyboardEvent(type, {
          key: 'a',
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        ta.dispatchEvent(ev);
      }
      expect(seen).toEqual([]);
    } finally {
      document.removeEventListener('keydown', onDoc);
      document.removeEventListener('keyup', onDoc);
      document.removeEventListener('keypress', onDoc);
    }
  });

  it('E3: Enter sends (clears composer when configured); Shift+Enter keeps text', async () => {
    const el = mount({
      open: '',
      'api-base-url': 'https://api.example.com/v1',
      model: 'm',
    });
    el.apiKey = 'sk-test';
    const ta = composer(el);

    // Shift+Enter should not clear / send
    ta.value = 'line1';
    const shiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    ta.dispatchEvent(shiftEnter);
    expect(ta.value).toBe('line1');

    // Mock engine send path: without network, Enter with incomplete config shows error and keeps text? 
    // With full config it will try fetch — stub fetch to avoid network.
    const fetchMock = vi.fn(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
            ),
          );
          c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Recreate engine by setConfig so fetch is used via globalThis.fetch in new ChatEngine
    el.setConfig({
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'm',
      provider: 'openai',
    });
    // Force engine recreate to pick up stubbed fetch
    (el as any).ensureEngine(true);

    ta.value = 'send me';
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    ta.dispatchEvent(enter);
    // allow async handleSend
    await vi.waitFor(() => {
      expect(ta.value).toBe('');
    });
  });

  it('E4: settings open/close; inputs remain editable with keyboard isolation', () => {
    const el = mount({ open: '' });
    const settingsBtn = el.shadowRoot!.querySelector(
      '[data-act="settings"]',
    ) as HTMLButtonElement;
    settingsBtn.click();
    const drawer = el.shadowRoot!.querySelector(
      '.sc-settings-drawer',
    ) as HTMLElement;
    expect(drawer.hidden).toBe(false);

    const model = settingsInput(el, 'model');
    expect(model).toBeTruthy();
    model.value = 'gpt-test';
    expect(model.value).toBe('gpt-test');

    const seen: string[] = [];
    document.addEventListener('keydown', (e) => seen.push(e.key));
    model.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'x',
        bubbles: true,
        composed: true,
      }),
    );
    expect(seen).toEqual([]);
    document.removeEventListener('keydown', () => {});

    const closeBtn = el.shadowRoot!.querySelector(
      '[data-act="settings-close"]',
    ) as HTMLButtonElement;
    closeBtn.click();
    expect(drawer.hidden).toBe(true);

    // composer still editable
    const ta = composer(el);
    ta.value = 'after';
    expect(ta.value).toBe('after');
  });

  it('E5: setConfig preserves composer text', () => {
    const el = mount({ open: '' });
    const ta = composer(el);
    ta.value = 'keep me';
    el.setConfig({
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'sk',
      model: 'm',
      systemPrompt: 'sys',
      provider: 'openai',
    });
    expect(composer(el).value).toBe('keep me');
  });

  it('focusComposer focuses the textarea', () => {
    const el = mount({ open: '' });
    el.focusComposer();
    expect(el.shadowRoot!.activeElement).toBe(composer(el));
  });

  it('provider radio shows chrome-ai panel and warns about tools', async () => {
    const el = mount({ open: '' });
    el.registerTool({
      name: 't',
      description: 'd',
      parameters: {},
      handler: () => 1,
    });
    (el.shadowRoot!.querySelector('[data-act="settings"]') as HTMLButtonElement).click();
    const chromeRadio = el.shadowRoot!.querySelector(
      'input[data-field="provider"][value="chrome-ai"]',
    ) as HTMLInputElement;
    chromeRadio.checked = true;
    chromeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    const panel = el.shadowRoot!.querySelector(
      '[data-chrome-ai-panel]',
    ) as HTMLElement;
    expect(panel.hidden).toBe(false);
    const warn = el.shadowRoot!.querySelector(
      '[data-chrome-ai-tools-warn]',
    ) as HTMLElement;
    expect(warn.hidden).toBe(false);
  });
});

describe('custom element registration', () => {
  it('is defined as simple-chat', () => {
    expect(customElements.get('simple-chat')).toBe(SimpleChatElement);
  });
});

describe('layout=extension', () => {
  it('uses full-page layout with persistent thread rail and hides close', () => {
    const el = mount({ layout: 'extension', open: '' });
    const root = el.shadowRoot!.querySelector('.sc-root') as HTMLElement;
    expect(root.dataset.layout).toBe('extension');
    expect(root.dataset.closed).toBe('false');

    const drawer = el.shadowRoot!.querySelector('.sc-thread-drawer') as HTMLElement;
    expect(drawer.hidden).toBe(false);

    const main = el.shadowRoot!.querySelector('.sc-main') as HTMLElement;
    expect(main).toBeTruthy();
    expect(main.querySelector('.sc-composer')).toBeTruthy();
    expect(main.querySelector('.sc-messages')).toBeTruthy();
    expect(main.querySelector('.sc-settings-drawer')).toBeTruthy();

    const closeBtn = el.shadowRoot!.querySelector('[data-act="close"]') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    // CSS hides it; attribute still present for non-extension hosts sharing shell.
    const style = getComputedStyle(closeBtn);
    expect(style.display).toBe('none');

    const github = el.shadowRoot!.querySelector('a.sc-github-link') as HTMLAnchorElement;
    expect(github).toBeTruthy();
    expect(github.href).toBe('https://github.com/SimpleAI2026/SimpleChat');
    expect(github.target).toBe('_blank');
    expect(github.rel).toContain('noopener');
    expect(getComputedStyle(github).display).not.toBe('none');

    // Settings still opens with all panels present
    (el.shadowRoot!.querySelector('[data-act="settings"]') as HTMLButtonElement).click();
    const settings = el.shadowRoot!.querySelector('.sc-settings-drawer') as HTMLElement;
    expect(settings.hidden).toBe(false);
    expect(settings.querySelector('input[data-field="provider"][value="openai"]')).toBeTruthy();
    expect(settings.querySelector('input[data-field="provider"][value="chrome-ai"]')).toBeTruthy();
    expect(settings.querySelector('[data-field="systemPrompt"]')).toBeTruthy();
    expect(settings.querySelector('[data-field="themeGrid"]')).toBeTruthy();
    expect(settings.querySelector('[data-field="toolBg"]')).toBeTruthy();
    expect(settings.querySelector('[data-host-settings]')).toBeTruthy();
    // Thread rail stays visible while settings overlays main
    expect(drawer.hidden).toBe(false);
  });

  it('ignores close action in extension layout', () => {
    const el = mount({ layout: 'extension', open: '' });
    const root = el.shadowRoot!.querySelector('.sc-root') as HTMLElement;
    (el.shadowRoot!.querySelector('[data-act="close"]') as HTMLButtonElement).click();
    expect(el.open).toBe(true);
    expect(root.dataset.closed).toBe('false');
  });

  it('keeps thread rail after selecting a thread', async () => {
    const el = mount({ layout: 'extension', open: '' });
    // create a second thread via new, then ensure rail still open
    (el.shadowRoot!.querySelector('[data-act="new"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const drawer = el.shadowRoot!.querySelector('.sc-thread-drawer') as HTMLElement;
      expect(drawer.hidden).toBe(false);
    });
  });
});


describe('narrow / mobile (data-narrow)', () => {
  it('sets data-narrow on host when viewport ≤640px', () => {
    stubMatchMedia(true);
    const el = mount({ layout: 'sidebar', open: '' });
    expect(el.hasAttribute('data-narrow')).toBe(true);
    const root = el.shadowRoot!.querySelector('.sc-root') as HTMLElement;
    expect(root.dataset.narrow).toBe('true');
  });

  it('hides resize handle on narrow sidebar', () => {
    stubMatchMedia(true);
    const el = mount({ layout: 'sidebar', open: '' });
    const handle = el.shadowRoot!.querySelector('.sc-resize-handle') as HTMLElement;
    expect(handle).toBeTruthy();
    expect(handle.hidden).toBe(true);
  });

  it('extension narrow: does not force thread drawer open', () => {
    stubMatchMedia(true);
    const el = mount({ layout: 'extension', open: '' });
    expect(el.hasAttribute('data-narrow')).toBe(true);
    const drawer = el.shadowRoot!.querySelector('.sc-thread-drawer') as HTMLElement;
    // Overlay mode — closed until user opens threads
    expect(drawer.hidden).toBe(true);
  });

  it('extension narrow: thread drawer opens via toggle and collapses after select', async () => {
    stubMatchMedia(true);
    const el = mount({ layout: 'extension', open: '', 'storage-key': 'narrow-ext-select' });
    const drawer = el.shadowRoot!.querySelector('.sc-thread-drawer') as HTMLElement;
    expect(drawer.hidden).toBe(true);

    (el.shadowRoot!.querySelector('[data-act="threads"]') as HTMLButtonElement).click();
    expect(drawer.hidden).toBe(false);

    // Create a thread then open list and select it — should collapse on narrow.
    (el.shadowRoot!.querySelector('[data-act="new"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(drawer.hidden).toBe(true);
    });

    (el.shadowRoot!.querySelector('[data-act="threads"]') as HTMLButtonElement).click();
    expect(drawer.hidden).toBe(false);

    await vi.waitFor(() => {
      expect(drawer.querySelectorAll('[data-thread]').length).toBeGreaterThan(0);
    });
    const item = drawer.querySelector('[data-thread]') as HTMLButtonElement;
    item.click();
    await vi.waitFor(() => {
      expect(drawer.hidden).toBe(true);
    });
  });

  it('extension wide still keeps persistent thread rail', () => {
    stubMatchMedia(false);
    const el = mount({ layout: 'extension', open: '' });
    expect(el.hasAttribute('data-narrow')).toBe(false);
    const drawer = el.shadowRoot!.querySelector('.sc-thread-drawer') as HTMLElement;
    expect(drawer.hidden).toBe(false);
  });

  it('entering narrow collapses extension rail into overlay (and leaving restores rail)', () => {
    stubMatchMedia(false);
    const el = mount({ layout: 'extension', open: '' });
    const drawer = el.shadowRoot!.querySelector('.sc-thread-drawer') as HTMLElement;
    expect(el.hasAttribute('data-narrow')).toBe(false);
    expect(drawer.hidden).toBe(false);

    // Simulate breakpoint crossing (matchMedia change → setNarrow).
    const host = el as unknown as { setNarrow: (n: boolean) => void };
    host.setNarrow(true);
    expect(el.hasAttribute('data-narrow')).toBe(true);
    expect(drawer.hidden).toBe(true);

    host.setNarrow(false);
    expect(el.hasAttribute('data-narrow')).toBe(false);
    expect(drawer.hidden).toBe(false);
  });
});

describe('attachments Phase A', () => {
  function tinyPngFile(name = 't.png'): File {
    // 1x1 PNG
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new File([bin], name, { type: 'image/png' });
  }

  it('shows chip after selecting an image and can remove it', async () => {
    const el = mount({ open: '' });
    const input = el.shadowRoot!.querySelector('.sc-file-input') as HTMLInputElement;
    expect(input.accept).toContain('image');
    const file = tinyPngFile();
    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(input, 'files', { value: dt.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      const chips = el.shadowRoot!.querySelectorAll('.sc-attach-chip');
      expect(chips.length).toBe(1);
    });
    const remove = el.shadowRoot!.querySelector('[data-remove-att]') as HTMLButtonElement;
    remove.click();
    await vi.waitFor(() => {
      expect(el.shadowRoot!.querySelectorAll('.sc-attach-chip').length).toBe(0);
    });
  });

  it('rejects non-image even if forced', async () => {
    const el = mount({ open: '' });
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    await (el as any).addFiles([file]);
    expect(el.shadowRoot!.querySelectorAll('.sc-attach-chip').length).toBe(0);
    const err = el.shadowRoot!.querySelector('.sc-error') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent || '').toMatch(/图片/);
  });

  it('image-only send uses data URL without upload handler', async () => {
    const el = mount({
      open: '',
      'api-base-url': 'https://api.example.com/v1',
      model: 'm',
    });
    el.apiKey = 'sk-test';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
            ),
          );
          c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    el.setConfig({
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'm',
      provider: 'openai',
    });
    (el as any).ensureEngine(true);

    await (el as any).addFiles([tinyPngFile('solo.png')]);
    expect(el.shadowRoot!.querySelectorAll('.sc-attach-chip').length).toBe(1);
    await (el as any).handleSend();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const call = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const body = JSON.parse(String(call[1].body));
    const user = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(Array.isArray(user.content)).toBe(true);
    const img = user.content.find((p: { type: string }) => p.type === 'image_url');
    expect(img.image_url.url.startsWith('data:image/png')).toBe(true);
    expect(img.image_url.detail).toBe('auto');
  });

  it('calls setUploadHandler and uses returned url', async () => {
    const el = mount({
      open: '',
      'api-base-url': 'https://api.example.com/v1',
      model: 'm',
    });
    const upload = vi.fn(async () => ({ url: 'https://cdn.example/x.png', mime: 'image/png', name: 'x.png' }));
    el.setUploadHandler(upload);
    const fetchMock = vi.fn(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
            ),
          );
          c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    el.setConfig({
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'm',
      provider: 'openai',
    });
    (el as any).ensureEngine(true);
    await (el as any).addFiles([tinyPngFile()]);
    await (el as any).handleSend();
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const body = JSON.parse(String(call[1].body));
    const user = body.messages.find((m: { role: string }) => m.role === 'user');
    const img = user.content.find((p: { type: string }) => p.type === 'image_url');
    expect(img.image_url.url).toBe('https://cdn.example/x.png');
  });

  it('blocks chrome-ai send when attachments present', async () => {
    const el = mount({ open: '' });
    el.setConfig({ provider: 'chrome-ai', apiBaseUrl: '', apiKey: '', model: '' });
    (globalThis as any).LanguageModel = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        prompt: vi.fn(async () => 'x'),
        promptStreaming: undefined,
      })),
    };
    await (el as any).addFiles([tinyPngFile()]);
    await (el as any).handleSend();
    const err = el.shadowRoot!.querySelector('.sc-error') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent || '').toMatch(/Nano|云端|图片/);
  });
});


describe('SimpleChatElement typing bubble', () => {
  function tinyPngFile(name = 't.png'): File {
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new File([bin], name, { type: 'image/png' });
  }

  function typingEl(el: SimpleChatElement): HTMLElement | null {
    return el.shadowRoot!.querySelector('.sc-typing') as HTMLElement | null;
  }

  it('shows animated .sc-typing with aria-busy for empty streaming assistant', () => {
    const el = mount({ open: '' });
    (el as any).streaming = true;
    (el as any).messages = [
      {
        id: 'a1',
        threadId: 't1',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'streaming',
      },
    ];
    (el as any).renderMessages();
    const tip = typingEl(el);
    expect(tip).toBeTruthy();
    expect(tip!.getAttribute('aria-busy')).toBe('true');
    expect(tip!.querySelectorAll('.sc-typing-dot').length).toBe(3);
    const msgHtml = el.shadowRoot!.querySelector('.sc-messages')!.innerHTML;
    expect(msgHtml).toContain('sc-typing');
    expect(msgHtml).not.toMatch(/sc-bubble">…</);
  });

  it('hides typing on first text content', () => {
    const el = mount({ open: '' });
    (el as any).streaming = true;
    (el as any).messages = [
      {
        id: 'a1',
        threadId: 't1',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'streaming',
      },
    ];
    (el as any).renderMessages();
    expect(typingEl(el)).toBeTruthy();

    (el as any).messages[0].content = 'Hello';
    (el as any).renderMessages();
    expect(typingEl(el)).toBeNull();
    expect(el.shadowRoot!.querySelector('.sc-bubble')!.textContent).toContain('Hello');
  });

  it('hides typing on stop', () => {
    const el = mount({ open: '' });
    (el as any).streaming = true;
    (el as any).messages = [
      {
        id: 'a1',
        threadId: 't1',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'streaming',
      },
    ];
    (el as any).renderMessages();
    expect(typingEl(el)).toBeTruthy();

    (el as any).streaming = false;
    (el as any).renderMessages();
    expect(typingEl(el)).toBeNull();
  });

  it('shows optimistic typing while streaming before assistant message exists (upload wait)', () => {
    const el = mount({ open: '' });
    (el as any).streaming = true;
    (el as any).messages = [
      {
        id: 'u1',
        threadId: 't1',
        role: 'user',
        content: 'hi',
        createdAt: Date.now(),
        status: 'done',
      },
    ];
    (el as any).renderMessages();
    expect(typingEl(el)).toBeTruthy();
  });

  it('sets streaming early so upload wait shows typing', async () => {
    const el = mount({
      open: '',
      'api-base-url': 'https://api.example.com/v1',
      model: 'm',
    });
    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>((r) => {
      releaseUpload = r;
    });
    el.setUploadHandler(async () => {
      await uploadGate;
      return { url: 'https://cdn.example/x.png', mime: 'image/png', name: 'x.png' };
    });
    const fetchMock = vi.fn(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
            ),
          );
          c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    el.setConfig({
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'm',
      provider: 'openai',
    });
    (el as any).ensureEngine(true);

    await (el as any).addFiles([tinyPngFile()]);

    const sendPromise = (el as any).handleSend();
    await vi.waitFor(() => {
      expect((el as any).streaming).toBe(true);
      expect(typingEl(el)).toBeTruthy();
    });
    releaseUpload();
    await sendPromise;
    await vi.waitFor(() => expect((el as any).streaming).toBe(false));
    expect(typingEl(el)).toBeNull();
  });
});
