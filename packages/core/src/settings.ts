import type { EnvDefaults } from './env.js';
import { readEnvDefaults } from './env.js';
import type { ToolStyleOverrides } from './themes.js';
import { DEFAULT_THEME_ID, isThemeId } from './themes.js';

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
}

export interface ResolvedChatSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  rememberKey: boolean;
  themeId: string;
  toolStyle: ToolStyleOverrides;
}

/** localStorage key for in-panel settings, scoped by element storage-key. */
/** Sidebar / host panel width (px). Shared UI chrome, not per-thread. */
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
export function mergeConfigPriority(input: {
  host?: Partial<{
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    themeId?: string;
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
    '';

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

  return {
    apiBaseUrl,
    apiKey,
    model,
    systemPrompt,
    rememberKey,
    themeId,
    toolStyle,
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
  }>,
): ResolvedChatSettings {
  return mergeConfigPriority({
    host,
    stored: loadPersistedSettings(storageKey),
    env: readEnvDefaults(),
  });
}
