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
