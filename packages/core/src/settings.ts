import type { EnvDefaults } from './env.js';
import { readEnvDefaults } from './env.js';
import type { ToolStyleOverrides } from './themes.js';
import { DEFAULT_THEME_ID, isThemeId } from './themes.js';
import type { ChatProviderId } from './providers/types.js';
import { isChatProviderId } from './providers/types.js';
import { isLanguageModelPresent } from './providers/ChromeAiProvider.js';

/** Persisted OpenAI-compatible settings (scoped by storage-key). */
export interface PersistedSettings {
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  /** When true, apiKey was intentionally saved. */
  rememberKey?: boolean;
  /** Named theme pack id (e.g. bw, ocean). */
  themeId?: string;
  /** Tool card style overrides. */
  toolStyle?: ToolStyleOverrides;
  /** openai (cloud) | chrome-ai (Gemini Nano). */
  provider?: ChatProviderId;
}

export interface ResolvedChatSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  rememberKey: boolean;
  themeId: string;
  toolStyle: ToolStyleOverrides;
  provider: ChatProviderId;
}

/** localStorage key for in-panel settings, scoped by element storage-key. */
/** Sidebar / host panel width (px). Shared UI chrome, not per-thread. */
/** Default OpenAI-compatible model id when none is set via host / storage / env. */
export const DEFAULT_MODEL = 'zai-org/GLM-5.3-Flash';

export const SC_WIDTH_MIN = 320;
export const SC_WIDTH_MAX = 720;
export const SC_WIDTH_DEFAULT = 400;
export const SC_WIDTH_STORAGE_KEY = 'simplechat:sidebar-width';

export function clampSidebarWidth(n: number): number {
  if (!Number.isFinite(n)) return SC_WIDTH_DEFAULT;
  return Math.min(SC_WIDTH_MAX, Math.max(SC_WIDTH_MIN, Math.round(n)));
}

export function loadSidebarWidth(): number {
  try {
    if (typeof localStorage === 'undefined') return SC_WIDTH_DEFAULT;
    const raw = localStorage.getItem(SC_WIDTH_STORAGE_KEY);
    if (raw == null || raw === '') return SC_WIDTH_DEFAULT;
    return clampSidebarWidth(Number(raw));
  } catch {
    return SC_WIDTH_DEFAULT;
  }
}

export function saveSidebarWidth(width: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SC_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function settingsStorageKey(storageKey: string): string {
  return `${storageKey || 'simplechat'}:settings`;
}

export function loadPersistedSettings(
  storageKey: string,
): PersistedSettings | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(settingsStorageKey(storageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSettings;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedSettings(
  storageKey: string,
  settings: PersistedSettings,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = settingsStorageKey(storageKey);
    const payload: PersistedSettings = {
      apiBaseUrl: settings.apiBaseUrl ?? '',
      model: settings.model ?? '',
      systemPrompt: settings.systemPrompt ?? '',
      rememberKey: !!settings.rememberKey,
      themeId: isThemeId(settings.themeId) ? settings.themeId : DEFAULT_THEME_ID,
      provider: isChatProviderId(settings.provider) ? settings.provider : undefined,
    };
    if (payload.rememberKey && settings.apiKey) {
      payload.apiKey = settings.apiKey;
    }
    if (settings.toolStyle && typeof settings.toolStyle === 'object') {
      const ts: ToolStyleOverrides = {};
      if (settings.toolStyle.bg?.trim()) ts.bg = settings.toolStyle.bg.trim();
      if (settings.toolStyle.border?.trim()) ts.border = settings.toolStyle.border.trim();
      if (settings.toolStyle.radius?.trim()) ts.radius = settings.toolStyle.radius.trim();
      if (settings.toolStyle.fontSize?.trim()) ts.fontSize = settings.toolStyle.fontSize.trim();
      if (Object.keys(ts).length) payload.toolStyle = ts;
    }
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

function nonEmpty(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/**
 * Merge priority (highest first):
 * 1. Explicit host props/attrs (non-empty)
 * 2. localStorage saved settings
 * 3. Environment defaults (Base URL / Key / Model only)
 * 4. Empty
 */
/**
 * Sync default provider: if no explicit provider and no apiKey and LanguageModel
 * is present, prefer chrome-ai (availability refined async in UI).
 */
export function defaultProviderId(opts: {
  hostProvider?: string | null;
  storedProvider?: string | null;
  apiKey: string;
}): ChatProviderId {
  if (isChatProviderId(opts.hostProvider)) return opts.hostProvider;
  if (isChatProviderId(opts.storedProvider)) return opts.storedProvider;
  if (!String(opts.apiKey || '').trim() && isLanguageModelPresent()) {
    return 'chrome-ai';
  }
  return 'openai';
}

export function mergeConfigPriority(input: {
  host?: Partial<{
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    themeId?: string;
    provider?: ChatProviderId | string;
  }>;
  stored?: PersistedSettings | null;
  env?: EnvDefaults | null;
}): ResolvedChatSettings {
  const host = input.host ?? {};
  const stored = input.stored ?? null;
  const env = input.env ?? {};

  const apiBaseUrl =
    nonEmpty(host.apiBaseUrl) ||
    nonEmpty(stored?.apiBaseUrl) ||
    nonEmpty(env.apiBaseUrl) ||
    '';

  const storedKey =
    stored?.rememberKey && stored.apiKey ? nonEmpty(stored.apiKey) : '';
  const apiKey =
    nonEmpty(host.apiKey) || storedKey || nonEmpty(env.apiKey) || '';

  const model =
    nonEmpty(host.model) ||
    nonEmpty(stored?.model) ||
    nonEmpty(env.model) ||
    DEFAULT_MODEL;

  const systemPrompt =
    nonEmpty(host.systemPrompt) || nonEmpty(stored?.systemPrompt) || '';

  const rememberKey = stored?.rememberKey === true;

  const hostTheme = nonEmpty(host.themeId);
  const storedTheme = nonEmpty(stored?.themeId);
  const themeId =
    (isThemeId(hostTheme) ? hostTheme : '') ||
    (isThemeId(storedTheme) ? storedTheme : '') ||
    DEFAULT_THEME_ID;

  const toolStyle: ToolStyleOverrides = { ...(stored?.toolStyle || {}) };

  const provider = defaultProviderId({
    hostProvider: nonEmpty(host.provider),
    storedProvider: nonEmpty(stored?.provider),
    apiKey,
  });

  return {
    apiBaseUrl,
    apiKey,
    model,
    systemPrompt,
    rememberKey,
    themeId,
    toolStyle,
    provider,
  };
}

/** Resolve effective settings for a storage-key using host + storage + env. */
export function resolveChatSettings(
  storageKey: string,
  host?: Partial<{
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    themeId?: string;
    provider?: ChatProviderId | string;
  }>,
): ResolvedChatSettings {
  return mergeConfigPriority({
    host,
    stored: loadPersistedSettings(storageKey),
    env: readEnvDefaults(),
  });
}
