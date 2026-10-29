/**
 * Read OpenAI-compatible defaults from process.env and/or Vite import.meta.env.
 * Safe in browsers without define — returns empty fields when unavailable.
 */
export interface EnvDefaults {
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
}

const BASE_KEYS = [
  'OPENAI_BASE_URL',
  'OPENAI_BASEURL',
  'VITE_OPENAI_BASE_URL',
  'VITE_OPENAI_BASEURL',
] as const;

const KEY_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_KEY',
  'VITE_OPENAI_API_KEY',
  'VITE_OPENAI_KEY',
] as const;

const MODEL_KEYS = [
  'OPENAI_MODEL',
  'MODEL',
  'VITE_OPENAI_MODEL',
  'VITE_MODEL',
] as const;

function trimNonEmpty(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

function firstFromRecord(
  record: Record<string, unknown> | undefined | null,
  keys: readonly string[],
): string {
  if (!record) return '';
  for (const k of keys) {
    const v = trimNonEmpty(record[k]);
    if (v) return v;
  }
  return '';
}

function readProcessEnv(keys: readonly string[]): string {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, unknown> } }).process;
    return firstFromRecord(proc?.env, keys);
  } catch {
    return '';
  }
}

function readImportMetaEnv(keys: readonly string[]): string {
  try {
    const meta = import.meta as ImportMeta & {
      env?: Record<string, unknown>;
    };
    return firstFromRecord(meta.env, keys);
  } catch {
    return '';
  }
}

function pickEnv(keys: readonly string[]): string {
  return readProcessEnv(keys) || readImportMetaEnv(keys);
}

/** Collect env defaults for Base URL / API Key / Model (any of the accepted names). */
export function readEnvDefaults(): EnvDefaults {
  const apiBaseUrl = pickEnv(BASE_KEYS);
  const apiKey = pickEnv(KEY_KEYS);
  const model = pickEnv(MODEL_KEYS);
  const out: EnvDefaults = {};
  if (apiBaseUrl) out.apiBaseUrl = apiBaseUrl;
  if (apiKey) out.apiKey = apiKey;
  if (model) out.model = model;
  return out;
}
