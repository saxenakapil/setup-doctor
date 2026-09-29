import { describe, expect, it } from 'vitest';
import { embeddedFontFaceCss } from '../../src/render/fonts.js';

const EXPECTED_FACES: { family: string; weight: number }[] = [
  { family: 'Bricolage Grotesque', weight: 600 },
  { family: 'Bricolage Grotesque', weight: 800 },
  { family: 'Figtree', weight: 400 },
  { family: 'Figtree', weight: 600 },
  { family: 'Figtree', weight: 700 },
  { family: 'JetBrains Mono', weight: 400 },
  { family: 'JetBrains Mono', weight: 700 },
];

describe('embeddedFontFaceCss', () => {
  it('embeds all seven bundled font weights as base64 data URIs, never a network URL', () => {
    const css = embeddedFontFaceCss();
    for (const { family, weight } of EXPECTED_FACES) {
      expect(css).toContain(`font-family: '${family}'; font-style: normal; font-weight: ${weight};`);
    }
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
  });

  it('emits exactly one @font-face rule per bundled weight, no duplicates', () => {
    const css = embeddedFontFaceCss();
    const count = (css.match(/@font-face/g) ?? []).length;
    expect(count).toBe(EXPECTED_FACES.length);
  });
});
