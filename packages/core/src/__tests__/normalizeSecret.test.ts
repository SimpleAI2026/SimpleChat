import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeSecret } from '../normalizeSecret.js';
import { ChatEngine } from '../ChatEngine.js';
import { MemoryStore } from '../MemoryStore.js';

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('normalizeSecret', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeSecret('')).toBe('');
    expect(normalizeSecret(null)).toBe('');
    expect(normalizeSecret(undefined)).toBe('');
  });

  it('returns a plain secret unchanged (trimmed)', () => {
    expect(normalizeSecret('  sk-plain  ')).toBe('sk-plain');
  });

  it('decodes my- + standard Base64', () => {
    const encoded = btoa('decoded-secret');
    expect(normalizeSecret(`my-${encoded}`)).toBe('decoded-secret');
  });

  it('decodes my- + URL-safe Base64 without padding', () => {
    const encoded = btoa('decoded-secret')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(normalizeSecret(` my-${encoded} `)).toBe('decoded-secret');
  });

  it('falls back to the original when atob throws', () => {
    vi.stubGlobal('atob', () => {
      throw new Error('bad b64');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeSecret('my-$$$')).toBe('my-$$$');
    expect(warn).toHaveBeenCalled();
  });

  it('uses Buffer when atob is unavailable', () => {
    const originalAtob = globalThis.atob;
    // @ts-expect-error intentional
    globalThis.atob = undefined;
    try {
      const encoded = Buffer.from('from-buffer').toString('base64');
      expect(normalizeSecret(`my-${encoded}`)).toBe('from-buffer');
    } finally {
      globalThis.atob = originalAtob;
    }
  });

  it('returns the original my- secret when neither atob nor Buffer can decode', () => {
    const originalAtob = globalThis.atob;
    const originalBuffer = (globalThis as { Buffer?: unknown }).Buffer;
    // @ts-expect-error intentional
    globalThis.atob = undefined;
    // @ts-expect-error intentional
    delete (globalThis as { Buffer?: unknown }).Buffer;
    try {
      expect(normalizeSecret('my-abc')).toBe('my-abc');
    } finally {
      globalThis.atob = originalAtob;
      if (originalBuffer !== undefined) {
        (globalThis as { Buffer?: unknown }).Buffer = originalBuffer;
      }
    }
  });
});

describe('ChatEngine Authorization uses normalizeSecret', () => {
  it('sends decoded Bearer token when apiKey is my-...', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        sseChunk({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        'data: [DONE]\n\n',
      ]),
    );
    const encoded = btoa('real-key')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const engine = new ChatEngine({
      config: {
        apiBaseUrl: 'https://api.example.com/v1',
        apiKey: `my-${encoded}`,
        model: 'm',
      },
      store: new MemoryStore(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    for await (const _ of engine.send('hi')) {
      /* drain */
    }

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer real-key');
  });
});
