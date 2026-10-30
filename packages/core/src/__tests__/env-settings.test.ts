import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readEnvDefaults } from '../env.js';
import {
  mergeConfigPriority,
  settingsStorageKey,
  loadPersistedSettings,
  savePersistedSettings,
} from '../settings.js';

type EnvMap = Record<string, string | undefined>;

function getProcessEnv(): EnvMap {
  const g = globalThis as { process?: { env?: EnvMap } };
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};
  return g.process.env;
}

describe('readEnvDefaults', () => {
  let snapshot: EnvMap;

  beforeEach(() => {
    snapshot = { ...getProcessEnv() };
  });

  afterEach(() => {
    const env = getProcessEnv();
    for (const k of Object.keys(env)) delete env[k];
    Object.assign(env, snapshot);
  });

  it('reads OPENAI_* / MODEL aliases from process.env', () => {
    const env = getProcessEnv();
    env.OPENAI_BASEURL = 'https://api.example.com/v1';
    env.OPENAI_KEY = 'sk-test';
    env.MODEL = 'gpt-test';
    const d = readEnvDefaults();
    expect(d.apiBaseUrl).toBe('https://api.example.com/v1');
    expect(d.apiKey).toBe('sk-test');
    expect(d.model).toBe('gpt-test');
  });

  it('prefers OPENAI_BASE_URL over OPENAI_BASEURL', () => {
    const env = getProcessEnv();
    env.OPENAI_BASE_URL = 'https://a.example/v1';
    env.OPENAI_BASEURL = 'https://b.example/v1';
    expect(readEnvDefaults().apiBaseUrl).toBe('https://a.example/v1');
  });

  it('returns empty object when unset', () => {
    const env = getProcessEnv();
    for (const k of [
      'OPENAI_BASE_URL',
      'OPENAI_BASEURL',
      'VITE_OPENAI_BASE_URL',
      'VITE_OPENAI_BASEURL',
      'OPENAI_API_KEY',
      'OPENAI_KEY',
      'VITE_OPENAI_API_KEY',
      'VITE_OPENAI_KEY',
      'OPENAI_MODEL',
      'MODEL',
      'VITE_OPENAI_MODEL',
      'VITE_MODEL',
    ]) {
      delete env[k];
    }
    expect(readEnvDefaults()).toEqual({});
  });
});

describe('mergeConfigPriority', () => {
  it('prefers non-empty host over stored and env', () => {
    const r = mergeConfigPriority({
      host: { apiBaseUrl: 'https://host', apiKey: 'host-key', model: 'host-model' },
      stored: {
        apiBaseUrl: 'https://stored',
        apiKey: 'stored-key',
        model: 'stored-model',
        rememberKey: true,
      },
      env: { apiBaseUrl: 'https://env', apiKey: 'env-key', model: 'env-model' },
    });
    expect(r).toEqual({
      apiBaseUrl: 'https://host',
      apiKey: 'host-key',
      model: 'host-model',
      systemPrompt: '',
      rememberKey: true,
      themeId: 'bw',
      toolStyle: {},
      provider: 'openai',
    });
  });

  it('falls back to stored then env when host empty', () => {
    const r = mergeConfigPriority({
      host: { apiBaseUrl: '', apiKey: '  ', model: undefined, systemPrompt: '' },
      stored: {
        apiBaseUrl: 'https://stored',
        apiKey: 'stored-key',
        model: '',
        systemPrompt: 'stored prompt',
        rememberKey: true,
      },
      env: { apiBaseUrl: 'https://env', apiKey: 'env-key', model: 'env-model' },
    });
    expect(r.apiBaseUrl).toBe('https://stored');
    expect(r.apiKey).toBe('stored-key');
    expect(r.model).toBe('env-model');
    expect(r.systemPrompt).toBe('stored prompt');
  });

  it('prefers host systemPrompt over stored', () => {
    const r = mergeConfigPriority({
      host: { systemPrompt: 'host prompt' },
      stored: { systemPrompt: 'stored prompt' },
    });
    expect(r.systemPrompt).toBe('host prompt');
  });

  it('ignores stored apiKey when rememberKey is false', () => {
    const r = mergeConfigPriority({
      host: {},
      stored: { apiKey: 'secret', rememberKey: false },
      env: { apiKey: 'env-key' },
    });
    expect(r.apiKey).toBe('env-key');
    expect(r.rememberKey).toBe(false);
  });
});

describe('persisted settings localStorage', () => {
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
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scopes key by storageKey and persists rememberKey', () => {
    expect(settingsStorageKey('demo')).toBe('demo:settings');
    savePersistedSettings('demo', {
      apiBaseUrl: 'https://x',
      model: 'm',
      systemPrompt: 'be helpful',
      apiKey: 'sk',
      rememberKey: true,
    });
    const loaded = loadPersistedSettings('demo');
    expect(loaded).toEqual({
      apiBaseUrl: 'https://x',
      model: 'm',
      systemPrompt: 'be helpful',
      rememberKey: true,
      apiKey: 'sk',
      themeId: 'bw',
    });
  });

  it('omits apiKey when rememberKey is false', () => {
    savePersistedSettings('demo', {
      apiBaseUrl: 'https://x',
      model: 'm',
      systemPrompt: 'p',
      apiKey: 'sk',
      rememberKey: false,
    });
    const loaded = loadPersistedSettings('demo');
    expect(loaded?.apiKey).toBeUndefined();
    expect(loaded?.systemPrompt).toBe('p');
    expect(loaded?.rememberKey).toBe(false);
    expect(loaded?.themeId).toBe('bw');
  });
});

describe('provider defaults', () => {
  afterEach(() => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  });

  it('uses stored/host provider when set', () => {
    const r = mergeConfigPriority({
      host: { provider: 'chrome-ai' },
      stored: { provider: 'openai' },
    });
    expect(r.provider).toBe('chrome-ai');
  });

  it('prefers chrome-ai when no key and LanguageModel present', () => {
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => 'available',
    };
    const r = mergeConfigPriority({ host: {}, stored: null, env: null });
    expect(r.provider).toBe('chrome-ai');
  });

  it('stays openai when apiKey present even if LanguageModel exists', () => {
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => 'available',
    };
    const r = mergeConfigPriority({
      host: { apiKey: 'sk-x' },
      stored: null,
    });
    expect(r.provider).toBe('openai');
  });
});
