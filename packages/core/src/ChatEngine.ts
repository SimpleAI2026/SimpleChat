import { ToolRegistry } from './ToolRegistry.js';
import { MemoryStore } from './MemoryStore.js';
import {
  chatCompletionsUrl,
  createId,
  type ChatEvent,
  type ChatMessage,
  type ChatThread,
  type HistoryStore,
  type HostTool,
  type SimpleChatConfig,
  type ToolCall,
} from './types.js';
import { mergeToolCallDeltas, parseSSEStream, type AccumulatedToolCall } from './sse.js';
import { normalizeSecret } from './normalizeSecret.js';

export interface ChatEngineOptions {
  config: SimpleChatConfig;
  store?: HistoryStore;
  storageKey?: string;
  fetchImpl?: typeof fetch;
}

type OpenAIMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: unknown[] }
  | { role: 'tool'; content: string; tool_call_id: string };

interface CompletionResult {
  finishReason: string | null;
  toolCalls: ToolCall[];
  assistantMessage: ChatMessage;
}

export class ChatEngine {
  config: SimpleChatConfig;
  readonly tools = new ToolRegistry();
  readonly store: HistoryStore;
  private fetchImpl: typeof fetch;
  private abort: AbortController | null = null;
  private listeners = new Set<(ev: ChatEvent) => void>();
  currentThreadId: string | null = null;

  constructor(opts: ChatEngineOptions) {
    this.config = { ...opts.config };
    this.store = opts.store ?? new MemoryStore();
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  on(listener: (ev: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: ChatEvent): void {
    for (const l of this.listeners) l(ev);
  }

  updateConfig(partial: Partial<SimpleChatConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  registerTool(tool: HostTool): void {
    this.tools.register(tool);
  }

  unregisterTool(name: string): void {
    this.tools.unregister(name);
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
  }

  async listThreads(): Promise<ChatThread[]> {
    return this.store.listThreads();
  }

  async getMessages(threadId: string): Promise<ChatMessage[]> {
    return this.store.getMessages(threadId);
  }

  async createThread(title = '新会话'): Promise<ChatThread> {
    const now = Date.now();
    const thread: ChatThread = {
      id: createId('thread'),
      title,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.upsertThread(thread);
    this.currentThreadId = thread.id;
    this.emit({ type: 'thread', thread });
    return thread;
  }

  async selectThread(id: string): Promise<void> {
    this.currentThreadId = id;
  }

  async deleteThread(id: string): Promise<void> {
    await this.store.deleteThread(id);
    if (this.currentThreadId === id) this.currentThreadId = null;
  }

  async ensureThread(): Promise<ChatThread> {
    if (this.currentThreadId) {
      const threads = await this.store.listThreads();
      const found = threads.find((t) => t.id === this.currentThreadId);
      if (found) return found;
    }
    return this.createThread();
  }

  async *send(userText: string): AsyncGenerator<ChatEvent> {
    const text = userText.trim();
    if (!text) return;

    const thread = await this.ensureThread();

    const userMsg: ChatMessage = {
      id: createId('msg'),
      threadId: thread.id,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      status: 'done',
    };
    await this.store.appendMessage(userMsg);
    if (thread.title === '新会话' || thread.title === 'New chat') {
      thread.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    }
    thread.updatedAt = Date.now();
    await this.store.upsertThread(thread);

    const userEv: ChatEvent = { type: 'message', message: userMsg };
    this.emit(userEv);
    yield userEv;
    this.emit({ type: 'thread', thread });

    this.abort = new AbortController();
    const signal = this.abort.signal;
    const maxRounds = this.config.maxToolRounds ?? 5;

    try {
      for (let round = 0; round <= maxRounds; round++) {
        const history = await this.store.getMessages(thread.id);
        const events: ChatEvent[] = [];
        const result = await this.runCompletion(thread, history, signal, (ev) => {
          events.push(ev);
          this.emit(ev);
        });
        for (const ev of events) yield ev;

        if (result.finishReason === 'tool_calls' && result.toolCalls.length) {
          for (const call of result.toolCalls) {
            const run = await this.tools.run(call.name, call.arguments, {
              threadId: thread.id,
              abortSignal: signal,
            });
            const content = run.ok
              ? JSON.stringify(run.result ?? null)
              : JSON.stringify({ error: run.error });
            const toolMsg: ChatMessage = {
              id: createId('msg'),
              threadId: thread.id,
              role: 'tool',
              content,
              toolCallId: call.id,
              createdAt: Date.now(),
              status: 'done',
            };
            await this.store.appendMessage(toolMsg);
            const toolEv: ChatEvent = {
              type: 'tool-result',
              toolCallId: call.id,
              name: call.name,
              result: run.ok ? run.result : run.error,
              error: !run.ok,
            };
            this.emit(toolEv);
            yield toolEv;
            const msgEv: ChatEvent = { type: 'message', message: toolMsg };
            this.emit(msgEv);
            yield msgEv;
          }
          continue;
        }

        const doneEv: ChatEvent = { type: 'done', message: result.assistantMessage };
        this.emit(doneEv);
        yield doneEv;
        return;
      }

      const err = new Error(`Exceeded maxToolRounds (${maxRounds})`);
      this.emit({ type: 'error', error: err });
      yield { type: 'error', error: err };
    } catch (err) {
      if (signal.aborted) {
        const aborted = new Error('Aborted');
        this.emit({ type: 'error', error: aborted });
        yield { type: 'error', error: aborted };
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit({ type: 'error', error });
      yield { type: 'error', error };
    } finally {
      this.abort = null;
    }
  }

  private async runCompletion(
    thread: ChatThread,
    history: ChatMessage[],
    signal: AbortSignal,
    onEvent: (ev: ChatEvent) => void,
  ): Promise<CompletionResult> {
    const { apiBaseUrl, apiKey, model, systemPrompt, temperature, maxTokens, headers, maxMessages } =
      this.config;

    if (!apiBaseUrl || !apiKey || !model) {
      throw new Error('apiBaseUrl, apiKey, and model are required');
    }

    const openaiMessages = this.toOpenAIMessages(history, systemPrompt, maxMessages ?? 40);
    const tools = this.tools.toOpenAI();

    const body: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      stream: true,
    };
    if (temperature != null) body.temperature = temperature;
    if (maxTokens != null) body.max_tokens = maxTokens;
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await this.fetchImpl(chatCompletionsUrl(apiBaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizeSecret(apiKey)}`,
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }
    if (!res.body) throw new Error('No response body');

    const assistantId = createId('msg');
    const assistantMessage: ChatMessage = {
      id: assistantId,
      threadId: thread.id,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
    };
    await this.store.appendMessage(assistantMessage);
    onEvent({ type: 'message', message: { ...assistantMessage } });

    const toolAcc = new Map<number, AccumulatedToolCall>();
    let finishReason: string | null = null;

    for await (const chunk of parseSSEStream(res.body, signal)) {
      if (chunk.finish_reason) finishReason = chunk.finish_reason;
      const delta = chunk.delta;
      if (!delta) continue;

      if (delta.content) {
        assistantMessage.content += delta.content;
        await this.store.updateMessage({ ...assistantMessage });
        onEvent({
          type: 'text-delta',
          delta: delta.content,
          messageId: assistantId,
        });
      }

      if (delta.tool_calls?.length) {
        mergeToolCallDeltas(toolAcc, delta.tool_calls);
      }
    }

    let toolCalls: ToolCall[] = [];
    if (toolAcc.size) {
      toolCalls = [...toolAcc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({
          id: v.id || createId('call'),
          name: v.name,
          arguments: v.arguments || '{}',
        }));
      assistantMessage.toolCalls = toolCalls;
      for (const tc of toolCalls) {
        onEvent({ type: 'tool-call', toolCall: tc, messageId: assistantId });
      }
      if (!finishReason) finishReason = 'tool_calls';
    }

    assistantMessage.status = 'done';
    await this.store.updateMessage({ ...assistantMessage });
    thread.updatedAt = Date.now();
    await this.store.upsertThread(thread);
    onEvent({ type: 'message', message: { ...assistantMessage } });

    return { finishReason, toolCalls, assistantMessage };
  }

  private toOpenAIMessages(
    history: ChatMessage[],
    systemPrompt: string | undefined,
    maxMessages: number,
  ): OpenAIMessage[] {
    const out: OpenAIMessage[] = [];
    if (systemPrompt) {
      out.push({ role: 'system', content: systemPrompt });
    }
    const sliced = history.slice(-maxMessages);
    for (const m of sliced) {
      if (m.role === 'tool') {
        out.push({
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId ?? '',
        });
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else if (m.role === 'system') {
        // injected from config each turn
      } else {
        out.push({ role: m.role as 'user' | 'assistant', content: m.content });
      }
    }
    return out;
  }
}

export function createChatClient(opts: ChatEngineOptions): ChatEngine {
  return new ChatEngine(opts);
}
