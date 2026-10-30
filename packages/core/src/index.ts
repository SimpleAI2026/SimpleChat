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
  ChatProviderId,
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
  DEFAULT_MODEL,
  defaultProviderId,
  resolveChatSettings,
  SC_WIDTH_MIN,
  SC_WIDTH_MAX,
  SC_WIDTH_DEFAULT,
  SC_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
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

export { normalizeSecret } from './normalizeSecret.js';

export {
  OpenAICompatProvider,
  ChromeAiProvider,
  chromeAiProviderSingleton,
  checkChromeAiAvailability,
  shouldPreferChromeAi,
  isLanguageModelPresent,
  messagesToPrompt,
  CHROME_AI_STATUS,
  isChatProviderId,
  type ChatProvider,
  type ChromeAiStatus,
  type ChromeAiAvailability,
  type OpenAICompatMessage,
  type ProviderStreamEvent,
  type ProviderStreamRequest,
} from './providers/index.js';
