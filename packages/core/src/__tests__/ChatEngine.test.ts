import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatEngine } from '../ChatEngine.js';
import { MemoryStore } from '../MemoryStore.js';
import { chatCompletionsUrl } from '../types.js';
import { ToolRegistry } from '../ToolRegistry.js';

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

describe('chatCompletionsUrl', () => {
  it('appends /chat/completions and strips trailing slash', () => {
    expect(chatCompletionsUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(chatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });
});

describe('ChatEngine', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('streams text deltas from mock SSE', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        sseChunk({
          choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
        }),
        sseChunk({
          choices: [{ delta: { content: ' world' }, finish_reason: null }],
        }),
        sseChunk({
          choices: [{ delta: {}, finish_reason: 'stop' }],
        }),
        'data: [DONE]\n\n',
      ]),
    );

    const engine = new ChatEngine({
      config: {
        apiBaseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'test-model',
      },
      store: new MemoryStore(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const deltas: string[] = [];
    let doneContent = '';
    for await (const ev of engine.send('hi')) {
      if (ev.type === 'text-delta') deltas.push(ev.delta);
      if (ev.type === 'done') doneContent = ev.message.content;
    }

    expect(deltas.join('')).toBe('Hello world');
    expect(doneContent).toBe('Hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(true);
    expect(body.messages.some((m: { role: string }) => m.role === 'user')).toBe(true);
  });

  it('runs tool loop and feeds result back', async () => {
    fetchMock
      .mockResolvedValueOnce(
        streamResponse([
          sseChunk({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'get_page_title', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
          sseChunk({
            choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          }),
          'data: [DONE]\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        streamResponse([
          sseChunk({
            choices: [{ delta: { content: 'Title is Demo' }, finish_reason: null }],
          }),
          sseChunk({
            choices: [{ delta: {}, finish_reason: 'stop' }],
          }),
          'data: [DONE]\n\n',
        ]),
      );

    const engine = new ChatEngine({
      config: {
        apiBaseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'test-model',
      },
      store: new MemoryStore(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    engine.registerTool({
      name: 'get_page_title',
      description: 'Get page title',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ title: 'Demo' }),
    });

    const toolResults: unknown[] = [];
    let final = '';
    for await (const ev of engine.send('what is the title?')) {
      if (ev.type === 'tool-result') toolResults.push(ev.result);
      if (ev.type === 'done') final = ev.message.content;
    }

    expect(toolResults).toEqual([{ title: 'Demo' }]);
    expect(final).toBe('Title is Demo');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.messages.some((m: { role: string }) => m.role === 'tool')).toBe(true);
    expect(secondBody.tools?.length).toBe(1);
  });

  it('surfaces HTTP errors', async () => {
    fetchMock.mockResolvedValue(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );
    const engine = new ChatEngine({
      config: {
        apiBaseUrl: 'https://api.example.com/v1',
        apiKey: 'bad',
        model: 'm',
      },
      store: new MemoryStore(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const errors: string[] = [];
    for await (const ev of engine.send('hi')) {
      if (ev.type === 'error') errors.push(ev.error.message);
    }
    expect(errors[0]).toMatch(/401/);
  });

  it('persists threads in MemoryStore', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        sseChunk({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        'data: [DONE]\n\n',
      ]),
    );
    const store = new MemoryStore();
    const engine = new ChatEngine({
      config: { apiBaseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
      store,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    for await (const _ of engine.send('first question')) {
      /* drain */
    }
    const threads = await engine.listThreads();
    expect(threads.length).toBe(1);
    expect(threads[0].title).toContain('first');
    const msgs = await engine.getMessages(threads[0].id);
    expect(msgs.some((m) => m.role === 'user')).toBe(true);
    expect(msgs.some((m) => m.role === 'assistant')).toBe(true);
  });
});

describe('ToolRegistry', () => {
  it('silently overwrites duplicate tool names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reg = new ToolRegistry();
    reg.register({
      name: 'a',
      description: 'd',
      parameters: {},
      handler: () => 1,
    });
    reg.register({
      name: 'a',
      description: 'd2',
      parameters: {},
      handler: () => 2,
    });
    expect(warn).not.toHaveBeenCalled();
    const r = await reg.run('a', '{}', {
      threadId: 't',
      abortSignal: new AbortController().signal,
    });
    expect(r).toEqual({ ok: true, result: 2 });
    warn.mockRestore();
  });
});


describe('multimodal attachments (Phase A)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  function okStream() {
    return streamResponse([
      sseChunk({ choices: [{ delta: { content: 'seen' }, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);
  }

  it('toOpenAIMessages: string-only legacy messages stay string content', async () => {
    fetchMock.mockResolvedValue(okStream());
    const store = new MemoryStore();
    const engine = new ChatEngine({
      config: { apiBaseUrl: 'https://api.example.com/v1', apiKey: 'sk', model: 'm' },
      store,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    for await (const _ of engine.send('hello only')) {
      /* drain */
    }
    const thread = (await engine.listThreads())[0];
    const msgs = await engine.getMessages(thread.id);
    const wire = engine.toOpenAIMessagesPublic(msgs);
    const user = wire.find((m) => m.role === 'user');
    expect(user && typeof user.content === 'string').toBe(true);
    expect(user && (user as { content: string }).content).toBe('hello only');
  });

  it('toOpenAIMessages: parts produce image_url array content', async () => {
    fetchMock.mockResolvedValue(okStream());
    const store = new MemoryStore();
    const engine = new ChatEngine({
      config: { apiBaseUrl: 'https://api.example.com/v1', apiKey: 'sk', model: 'm' },
      store,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    for await (const _ of engine.send('what is this?', {
      attachments: [
        {
          url: 'data:image/png;base64,abc',
          mime: 'image/png',
          name: 'a.png',
          detail: 'auto',
        },
      ],
    })) {
      /* drain */
    }
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const user = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(Array.isArray(user.content)).toBe(true);
    expect(user.content[0]).toEqual({ type: 'text', text: 'what is this?' });
    expect(user.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc', detail: 'auto' },
    });
  });

  it('send: image-only uses [image] placeholder and stores parts', async () => {
    fetchMock.mockResolvedValue(okStream());
    const store = new MemoryStore();
    const engine = new ChatEngine({
      config: { apiBaseUrl: 'https://api.example.com/v1', apiKey: 'sk', model: 'm' },
      store,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    for await (const _ of engine.send('', {
      attachments: [{ url: 'data:image/jpeg;base64,xx', name: 'x.jpg', mime: 'image/jpeg' }],
    })) {
      /* drain */
    }
    const thread = (await engine.listThreads())[0];
    const msgs = await engine.getMessages(thread.id);
    const user = msgs.find((m) => m.role === 'user')!;
    expect(user.parts?.length).toBe(2);
    expect(user.parts?.[0]).toEqual({ type: 'text', text: '[image]' });
    expect(user.content).toContain('x.jpg');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const wireUser = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(wireUser.content.some((p: { type: string }) => p.type === 'image_url')).toBe(true);
  });
});
