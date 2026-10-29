/** Full SimpleChat CSS custom-property tokens (sidebar + tool cards). */
export interface ThemeTokens {
  background: string;
  foreground: string;
  muted: string;
  mutedBg: string;
  border: string;
  primary: string;
  primaryFg: string;
  assistantBg: string;
  assistantBorder: string;
  ring: string;
  /** Tool card */
  toolBg: string;
  toolBorder: string;
  toolRadius: string;
  toolFontSize: string;
  toolHeadBorder: string;
  toolArgsBg: string;
  toolDotDone: string;
  toolDotError: string;
  toolDotPending: string;
}

export interface ThemePack {
  id: string;
  label: string;
  /** Small swatch colors for pickers: [primary, background, border] */
  swatch: [string, string, string];
  tokens: ThemeTokens;
}

/** Editable tool-card style overrides (persist in settings). */
export interface ToolStyleOverrides {
  bg?: string;
  border?: string;
  radius?: string;
  fontSize?: string;
}

export const DEFAULT_THEME_ID = 'bw';

const THEMES: ThemePack[] = [
  {
    id: 'bw',
    label: '黑白',
    swatch: ['#171717', '#ffffff', '#e5e5e5'],
    tokens: {
      background: '#ffffff',
      foreground: '#0a0a0a',
      muted: '#737373',
      mutedBg: '#f5f5f5',
      border: '#e5e5e5',
      primary: '#171717',
      primaryFg: '#fafafa',
      assistantBg: '#ffffff',
      assistantBorder: '#e5e5e5',
      ring: '#0a0a0a',
      toolBg: '#f5f5f5',
      toolBorder: '#e5e5e5',
      toolRadius: '8px',
      toolFontSize: '12px',
      toolHeadBorder: '#e5e5e5',
      toolArgsBg: '#ffffff',
      toolDotDone: '#0a0a0a',
      toolDotError: '#525252',
      toolDotPending: '#737373',
    },
  },
  {
    id: 'minimal',
    label: '简洁',
    swatch: ['#3f3f46', '#fafafa', '#e4e4e7'],
    tokens: {
      background: '#fafafa',
      foreground: '#18181b',
      muted: '#71717a',
      mutedBg: '#f4f4f5',
      border: '#e4e4e7',
      primary: '#3f3f46',
      primaryFg: '#fafafa',
      assistantBg: '#ffffff',
      assistantBorder: '#e4e4e7',
      ring: '#3f3f46',
      toolBg: '#f4f4f5',
      toolBorder: '#e4e4e7',
      toolRadius: '10px',
      toolFontSize: '12px',
      toolHeadBorder: '#e4e4e7',
      toolArgsBg: '#ffffff',
      toolDotDone: '#18181b',
      toolDotError: '#a1a1aa',
      toolDotPending: '#71717a',
    },
  },
  {
    id: 'ink',
    label: '墨色',
    swatch: ['#1e293b', '#f8fafc', '#cbd5e1'],
    tokens: {
      background: '#f8fafc',
      foreground: '#0f172a',
      muted: '#64748b',
      mutedBg: '#f1f5f9',
      border: '#cbd5e1',
      primary: '#1e293b',
      primaryFg: '#f8fafc',
      assistantBg: '#ffffff',
      assistantBorder: '#cbd5e1',
      ring: '#1e293b',
      toolBg: '#f1f5f9',
      toolBorder: '#cbd5e1',
      toolRadius: '8px',
      toolFontSize: '12px',
      toolHeadBorder: '#cbd5e1',
      toolArgsBg: '#ffffff',
      toolDotDone: '#0f172a',
      toolDotError: '#64748b',
      toolDotPending: '#94a3b8',
    },
  },
  {
    id: 'ocean',
    label: '海洋',
    swatch: ['#0369a1', '#f0f9ff', '#bae6fd'],
    tokens: {
      background: '#f0f9ff',
      foreground: '#0c4a6e',
      muted: '#0284c7',
      mutedBg: '#e0f2fe',
      border: '#bae6fd',
      primary: '#0369a1',
      primaryFg: '#f0f9ff',
      assistantBg: '#ffffff',
      assistantBorder: '#bae6fd',
      ring: '#0369a1',
      toolBg: '#e0f2fe',
      toolBorder: '#7dd3fc',
      toolRadius: '10px',
      toolFontSize: '12px',
      toolHeadBorder: '#7dd3fc',
      toolArgsBg: '#ffffff',
      toolDotDone: '#0369a1',
      toolDotError: '#b91c1c',
      toolDotPending: '#38bdf8',
    },
  },
  {
    id: 'forest',
    label: '森林',
    swatch: ['#166534', '#f0fdf4', '#bbf7d0'],
    tokens: {
      background: '#f0fdf4',
      foreground: '#14532d',
      muted: '#15803d',
      mutedBg: '#dcfce7',
      border: '#bbf7d0',
      primary: '#166534',
      primaryFg: '#f0fdf4',
      assistantBg: '#ffffff',
      assistantBorder: '#bbf7d0',
      ring: '#166534',
      toolBg: '#dcfce7',
      toolBorder: '#86efac',
      toolRadius: '10px',
      toolFontSize: '12px',
      toolHeadBorder: '#86efac',
      toolArgsBg: '#ffffff',
      toolDotDone: '#166534',
      toolDotError: '#b91c1c',
      toolDotPending: '#4ade80',
    },
  },
  {
    id: 'sunset',
    label: '日落',
    swatch: ['#c2410c', '#fff7ed', '#fed7aa'],
    tokens: {
      background: '#fff7ed',
      foreground: '#7c2d12',
      muted: '#c2410c',
      mutedBg: '#ffedd5',
      border: '#fed7aa',
      primary: '#c2410c',
      primaryFg: '#fff7ed',
      assistantBg: '#ffffff',
      assistantBorder: '#fed7aa',
      ring: '#c2410c',
      toolBg: '#ffedd5',
      toolBorder: '#fdba74',
      toolRadius: '12px',
      toolFontSize: '12px',
      toolHeadBorder: '#fdba74',
      toolArgsBg: '#ffffff',
      toolDotDone: '#c2410c',
      toolDotError: '#991b1b',
      toolDotPending: '#fb923c',
    },
  },
  {
    id: 'violet',
    label: '紫罗兰',
    swatch: ['#6d28d9', '#f5f3ff', '#ddd6fe'],
    tokens: {
      background: '#f5f3ff',
      foreground: '#4c1d95',
      muted: '#7c3aed',
      mutedBg: '#ede9fe',
      border: '#ddd6fe',
      primary: '#6d28d9',
      primaryFg: '#f5f3ff',
      assistantBg: '#ffffff',
      assistantBorder: '#ddd6fe',
      ring: '#6d28d9',
      toolBg: '#ede9fe',
      toolBorder: '#c4b5fd',
      toolRadius: '10px',
      toolFontSize: '12px',
      toolHeadBorder: '#c4b5fd',
      toolArgsBg: '#ffffff',
      toolDotDone: '#6d28d9',
      toolDotError: '#b91c1c',
      toolDotPending: '#a78bfa',
    },
  },
  {
    id: 'warmpaper',
    label: '暖纸',
    swatch: ['#92400e', '#fffbeb', '#fde68a'],
    tokens: {
      background: '#fffbeb',
      foreground: '#78350f',
      muted: '#a16207',
      mutedBg: '#fef3c7',
      border: '#fde68a',
      primary: '#92400e',
      primaryFg: '#fffbeb',
      assistantBg: '#fffef7',
      assistantBorder: '#fde68a',
      ring: '#92400e',
      toolBg: '#fef3c7',
      toolBorder: '#fcd34d',
      toolRadius: '8px',
      toolFontSize: '12px',
      toolHeadBorder: '#fcd34d',
      toolArgsBg: '#fffef7',
      toolDotDone: '#92400e',
      toolDotError: '#b45309',
      toolDotPending: '#d97706',
    },
  },
  {
    id: 'contrast',
    label: '高对比',
    swatch: ['#000000', '#ffffff', '#000000'],
    tokens: {
      background: '#ffffff',
      foreground: '#000000',
      muted: '#404040',
      mutedBg: '#f0f0f0',
      border: '#000000',
      primary: '#000000',
      primaryFg: '#ffffff',
      assistantBg: '#ffffff',
      assistantBorder: '#000000',
      ring: '#000000',
      toolBg: '#f0f0f0',
      toolBorder: '#000000',
      toolRadius: '4px',
      toolFontSize: '13px',
      toolHeadBorder: '#000000',
      toolArgsBg: '#ffffff',
      toolDotDone: '#000000',
      toolDotError: '#000000',
      toolDotPending: '#404040',
    },
  },
  {
    id: 'terminal',
    label: '终端',
    swatch: ['#22c55e', '#0a0a0a', '#14532d'],
    tokens: {
      background: '#0a0a0a',
      foreground: '#e5e5e5',
      muted: '#737373',
      mutedBg: '#171717',
      border: '#262626',
      primary: '#22c55e',
      primaryFg: '#052e16',
      assistantBg: '#111111',
      assistantBorder: '#262626',
      ring: '#22c55e',
      toolBg: '#171717',
      toolBorder: '#14532d',
      toolRadius: '6px',
      toolFontSize: '12px',
      toolHeadBorder: '#14532d',
      toolArgsBg: '#0a0a0a',
      toolDotDone: '#22c55e',
      toolDotError: '#ef4444',
      toolDotPending: '#a3a3a3',
    },
  },
];

const THEME_MAP = new Map(THEMES.map((t) => [t.id, t]));

export function listThemes(): ThemePack[] {
  return THEMES.map((t) => ({ ...t, tokens: { ...t.tokens }, swatch: [...t.swatch] as [string, string, string] }));
}

export function getTheme(id: string | null | undefined): ThemePack {
  const key = (id || '').trim();
  return THEME_MAP.get(key) ?? THEME_MAP.get(DEFAULT_THEME_ID)!;
}

export function isThemeId(id: string | null | undefined): boolean {
  return !!id && THEME_MAP.has(String(id).trim());
}

/** Map ThemeTokens → CSS custom property declarations (without :host wrapper). */
export function tokensToCssVars(tokens: ThemeTokens): string {
  const lines = [
    `--sc-background: ${tokens.background}`,
    `--sc-foreground: ${tokens.foreground}`,
    `--sc-muted: ${tokens.muted}`,
    `--sc-muted-bg: ${tokens.mutedBg}`,
    `--sc-border: ${tokens.border}`,
    `--sc-primary: ${tokens.primary}`,
    `--sc-primary-fg: ${tokens.primaryFg}`,
    `--sc-assistant-bg: ${tokens.assistantBg}`,
    `--sc-assistant-border: ${tokens.assistantBorder}`,
    `--sc-ring: ${tokens.ring}`,
    `--sc-tool-bg: ${tokens.toolBg}`,
    `--sc-tool-border: ${tokens.toolBorder}`,
    `--sc-tool-radius: ${tokens.toolRadius}`,
    `--sc-tool-font-size: ${tokens.toolFontSize}`,
    `--sc-tool-head-border: ${tokens.toolHeadBorder}`,
    `--sc-tool-args-bg: ${tokens.toolArgsBg}`,
    `--sc-tool-dot-done: ${tokens.toolDotDone}`,
    `--sc-tool-dot-error: ${tokens.toolDotError}`,
    `--sc-tool-dot-pending: ${tokens.toolDotPending}`,
  ];
  return lines.map((l) => `  ${l};`).join('\n');
}

export function getThemeCss(id: string | null | undefined): string {
  const pack = getTheme(id);
  return `:host {\n${tokensToCssVars(pack.tokens)}\n}`;
}

/** Build :host CSS for tool-card overrides only (non-empty fields). */
export function toolStyleToCss(style: ToolStyleOverrides | null | undefined): string {
  if (!style) return '';
  const lines: string[] = [];
  if (style.bg?.trim()) lines.push(`  --sc-tool-bg: ${style.bg.trim()};`);
  if (style.border?.trim()) lines.push(`  --sc-tool-border: ${style.border.trim()};`);
  if (style.radius?.trim()) lines.push(`  --sc-tool-radius: ${style.radius.trim()};`);
  if (style.fontSize?.trim()) lines.push(`  --sc-tool-font-size: ${style.fontSize.trim()};`);
  if (!lines.length) return '';
  return `:host {\n${lines.join('\n')}\n}`;
}

/**
 * Theme id priority (highest first):
 * 1. hostThemeId (non-empty)
 * 2. persistedThemeId
 * 3. default bw
 */
export function resolveThemeId(input: {
  hostThemeId?: string | null;
  persistedThemeId?: string | null;
}): string {
  const host = (input.hostThemeId || '').trim();
  if (host && isThemeId(host)) return host;
  const stored = (input.persistedThemeId || '').trim();
  if (stored && isThemeId(stored)) return stored;
  return DEFAULT_THEME_ID;
}

/** Common wrong token names → real SimpleChat tokens. */
const THEME_VAR_ALIASES: Record<string, string> = {
  '--sc-primary-color': '--sc-primary',
  '--sc-primary-fg-color': '--sc-primary-fg',
  '--sc-bg-color': '--sc-background',
  '--sc-background-color': '--sc-background',
  '--sc-foreground-color': '--sc-foreground',
  '--sc-border-color': '--sc-border',
  '--sc-muted-color': '--sc-muted',
  '--sc-muted-bg-color': '--sc-muted-bg',
  '--sc-card-bg-color': '--sc-tool-bg',
  '--sc-tool-bg-color': '--sc-tool-bg',
  '--sc-tool-border-color': '--sc-tool-border',
  '--sc-assistant-bg-color': '--sc-assistant-bg',
  '--sc-assistant-border-color': '--sc-assistant-border',
  '--sc-ring-color': '--sc-ring',
};

/**
 * Normalize host override CSS for Shadow DOM:
 * - :root → :host (vars must live on the host)
 * - rewrite common mistaken token names
 */
export function normalizeHostThemeCss(css: string): string {
  let out = (css || '').trim();
  if (!out) return '';
  out = out.replace(/(^|[^\w-]):root\b/g, '$1:host');
  for (const [from, to] of Object.entries(THEME_VAR_ALIASES)) {
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * Compose layered theme CSS.
 * Order (later wins for same vars): pack → tool overrides → host themeCss.
 * Host themeStyle is applied on the host element separately and also wins.
 */
export function composeThemeCss(input: {
  themeId?: string | null;
  toolStyle?: ToolStyleOverrides | null;
  hostThemeCss?: string | null;
}): string {
  const parts: string[] = [getThemeCss(input.themeId)];
  const toolCss = toolStyleToCss(input.toolStyle);
  if (toolCss) parts.push(toolCss);
  const host = normalizeHostThemeCss(input.hostThemeCss || '');
  if (host) parts.push(host);
  return parts.join('\n');
}
