import { describe, expect, it } from 'vitest';
import { embeddedFontFaceCss } from '../../src/render/fonts.js';

describe('embeddedFontFaceCss', () => {
  it('embeds the bundled Bricolage Grotesque weights as base64 data URIs, never a network URL', () => {
    const css = embeddedFontFaceCss();
    expect(css).toContain("font-family: 'Bricolage Grotesque'");
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('font-weight: 800');
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
  });

  it('does not emit a @font-face rule for a family with no bundled file yet (Figtree, JetBrains Mono)', () => {
    const css = embeddedFontFaceCss();
    expect(css).not.toContain("font-family: 'Figtree'");
    expect(css).not.toContain("font-family: 'JetBrains Mono'");
  });
});
