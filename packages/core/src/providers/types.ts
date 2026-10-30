import type { SimpleChatConfig } from '../types.js';
import type { StreamDelta } from '../sse.js';

/** Chat backend: OpenAI-compatible cloud vs Chrome Built-in AI (Gemini Nano). */
export type ChatProviderId = 'openai' | 'chrome-ai';

export type OpenAICompatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: unknown[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface ProviderStreamRequest {
  config: SimpleChatConfig;
  messages: OpenAICompatMessage[];
  /** OpenAI tools JSON; chrome-ai ignores (no tools on Nano in v1). */
  tools: unknown[];
  signal: AbortSignal;
}

export type ProviderStreamEvent =
  | { type: 'text-delta'; delta: string }
  | {
      type: 'tool-call-deltas';
      deltas: NonNullable<StreamDelta['tool_calls']>;
    }
  | { type: 'finish'; finishReason: string | null };

export interface ChatProvider {
  readonly id: ChatProviderId;
  /** Whether this provider can run OpenAI-style function tools. */
  readonly supportsTools: boolean;
  stream(req: ProviderStreamRequest): AsyncGenerator<ProviderStreamEvent>;
}

export function isChatProviderId(v: unknown): v is ChatProviderId {
  return v === 'openai' || v === 'chrome-ai';
}
