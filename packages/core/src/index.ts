export type {
  SimpleChatConfig,
  ChatThread,
  ChatMessage,
  ChatEvent,
  HostTool,
  ToolCall,
  ToolContext,
  HistoryStore,
  Role,
} from './types.js';
export {
  createId,
  normalizeBaseUrl,
  chatCompletionsUrl,
} from './types.js';
export { ChatEngine, createChatClient, type ChatEngineOptions } from './ChatEngine.js';
export { ToolRegistry } from './ToolRegistry.js';
export { MemoryStore } from './MemoryStore.js';
export { IndexedDBStore, indexedDbStore } from './IndexedDBStore.js';
export { parseSSEStream, mergeToolCallDeltas } from './sse.js';
export { readEnvDefaults, type EnvDefaults } from './env.js';
export {
  settingsStorageKey,
  loadPersistedSettings,
  savePersistedSettings,
  mergeConfigPriority,
  resolveChatSettings,
  type PersistedSettings,
  type ResolvedChatSettings,
} from './settings.js';
export {
  DEFAULT_THEME_ID,
  listThemes,
  getTheme,
  getThemeCss,
  isThemeId,
  tokensToCssVars,
  toolStyleToCss,
  composeThemeCss,
  normalizeHostThemeCss,
  resolveThemeId,
  type ThemeTokens,
  type ThemePack,
  type ToolStyleOverrides,
} from './themes.js';

export { parseToolArguments, extractBrokenCssField } from './parseToolArgs.js';
