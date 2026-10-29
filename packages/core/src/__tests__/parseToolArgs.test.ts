import { describe, it, expect } from 'vitest';
import { parseToolArguments, extractBrokenCssField } from '../parseToolArgs.js';
import { ToolRegistry } from '../ToolRegistry.js';

describe('parseToolArguments', () => {
  it('parses valid JSON', () => {
    expect(parseToolArguments('{"css":":host{color:red}"}')).toEqual({
      css: ':host{color:red}',
    });
  });

  it('accepts raw :host CSS without JSON wrapper', () => {
    const css = ':host {\n  --sc-primary: #0369a1;\n}';
    expect(parseToolArguments(css)).toEqual({ css });
  });

  it('repairs multiline css string with raw newlines', () => {
    const raw = `{
  "css": ":host {
  --sc-primary: #0369a1;
  --sc-tool-bg: #e0f2fe;
}"
}`;
    const parsed = parseToolArguments(raw) as { css: string };
    expect(parsed.css).toContain(':host');
    expect(parsed.css).toContain('--sc-primary: #0369a1');
    expect(parsed.css).toContain('--sc-tool-bg: #e0f2fe');
  });

  it('repairs unescaped quotes inside css value', () => {
    const raw = '{"css": ":host { content: "hi"; --sc-primary: #111; }", "note": "ok"}';
    const parsed = parseToolArguments(raw) as { css: string; note?: string };
    expect(parsed.css).toContain('--sc-primary: #111');
    expect(parsed.css).toContain('content:');
  });

  it('extractBrokenCssField returns null when missing', () => {
    expect(extractBrokenCssField('{"a":1}')).toBeNull();
  });
});

describe('ToolRegistry.run with broken CSS args', () => {
  it('does not return Invalid JSON for multiline propose_style_css args', async () => {
    const reg = new ToolRegistry();
    let got = '';
    reg.register({
      name: 'propose_style_css',
      description: 'test',
      parameters: { type: 'object', properties: { css: { type: 'string' } } },
      handler: async (args: { css: string }) => {
        got = args.css;
        return { ok: true };
      },
    });
    const raw = `{"css": ":host {
  --sc-primary: #0369a1;
}"}`;
    const run = await reg.run('propose_style_css', raw, {
      threadId: 't',
      abortSignal: new AbortController().signal,
    });
    expect(run.ok).toBe(true);
    expect(got).toContain('--sc-primary');
  });
});
