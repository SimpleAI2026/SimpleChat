import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THEME_ID,
  listThemes,
  getTheme,
  getThemeCss,
  isThemeId,
  resolveThemeId,
  composeThemeCss,
  toolStyleToCss,
  normalizeHostThemeCss,
} from '../themes.js';

describe('theme catalog', () => {
  it('lists 10 named packs including default bw', () => {
    const list = listThemes();
    expect(list).toHaveLength(10);
    expect(list.map((t) => t.id)).toEqual([
      'bw',
      'minimal',
      'ink',
      'ocean',
      'forest',
      'sunset',
      'violet',
      'warmpaper',
      'contrast',
      'terminal',
    ]);
    expect(getTheme('missing').id).toBe(DEFAULT_THEME_ID);
    expect(isThemeId('ocean')).toBe(true);
    expect(isThemeId('nope')).toBe(false);
  });

  it('getThemeCss emits :host custom properties', () => {
    const css = getThemeCss('ocean');
    expect(css).toContain(':host');
    expect(css).toContain('--sc-primary:');
    expect(css).toContain('--sc-tool-bg:');
  });

  it('resolveThemeId prefers host over persisted over default', () => {
    expect(
      resolveThemeId({ hostThemeId: 'forest', persistedThemeId: 'ocean' }),
    ).toBe('forest');
    expect(resolveThemeId({ hostThemeId: '', persistedThemeId: 'violet' })).toBe(
      'violet',
    );
    expect(resolveThemeId({ hostThemeId: 'nope', persistedThemeId: '' })).toBe(
      DEFAULT_THEME_ID,
    );
  });

  it('composeThemeCss layers pack → tool → host', () => {
    const css = composeThemeCss({
      themeId: 'bw',
      toolStyle: { bg: '#ffeeee', radius: '14px' },
      hostThemeCss: ':host { --sc-primary: #ff0000; }',
    });
    expect(css.indexOf('--sc-background')).toBeGreaterThan(-1);
    expect(css).toContain('--sc-tool-bg: #ffeeee');
    expect(css).toContain('--sc-tool-radius: 14px');
    expect(css.trim().endsWith('--sc-primary: #ff0000; }')).toBe(true);
    expect(toolStyleToCss({})).toBe('');
  });
});

describe('normalizeHostThemeCss', () => {
  it('maps :root and alias tokens to :host / real names', () => {
    const raw = `:root {
  --sc-primary-color: #228B22;
  --sc-bg-color: #FFFFFF;
  --sc-border-color: #000000;
  --sc-card-bg-color: #E0E0E0;
}`;
    const out = normalizeHostThemeCss(raw);
    expect(out).toContain(':host');
    expect(out).not.toContain(':root');
    expect(out).toContain('--sc-primary: #228B22');
    expect(out).toContain('--sc-background: #FFFFFF');
    expect(out).toContain('--sc-border: #000000');
    expect(out).toContain('--sc-tool-bg: #E0E0E0');
    expect(out).not.toContain('--sc-primary-color');
  });
});
