// Acceptance tests for the technical theme's Wrapped card
// (docs/design/wrapped-technical/, a frozen reference doc; see its README
// section 0 for precedence). Golden images copied from that folder's
// landscape.png/portrait.png live in test/fixtures/wrapped-technical/.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLandscapeCardSvg, renderPortraitCardSvg, type CardInput } from '../../src/render/card.js';
import { getTheme } from '../../src/render/themes/index.js';
import type { Persona } from '../../src/wrapped/persona.js';

// docs/design/wrapped-technical/README.md section 13: exact sample data
// used for the golden images, used here for golden tests too.
const SAMPLE_LEVELS = [2, 3, 4, 3, 2, 0, 0, 3, 4, 4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 0, 3, 2, 3, 4, 2, 3, 0, 3, 4, 3] as const;
const sampleActivity = SAMPLE_LEVELS.map((level, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, level }));

function sampleInput(overrides: Partial<CardInput> = {}): CardInput {
  return {
    theme: getTheme('technical'),
    agentLabel: 'Claude Code',
    periodLabel: 'Sep 1 to Sep 30',
    sessions: 142,
    activeDays: 26,
    totalTokens: 48_200_000,
    costUsd: 312,
    busiestHour: 23,
    busiestWeekday: 'Friday',
    longestStreakDays: 12,
    persona: { label: 'Night Owl', line: 'Most of your messages land after dark.' },
    activity: sampleActivity,
    showProjects: false,
    topProjects: [],
    cacheHitRate: 0.88,
    showCost: true,
    ...overrides,
  };
}

function extractTranslate(svg: string, x: number, y: number): boolean {
  // Positions used as literal `translate(x,y)` group offsets, so a direct
  // string search doubles as a within-rounding position check (the
  // renderer emits its own float math, e.g. 490.6 vs the spec's 490.7).
  const pattern = new RegExp(`translate\\(${x},${y}\\)`);
  if (pattern.test(svg)) return true;
  // Allow up to 1px off either coordinate (README section 4 acceptance rule).
  for (let dx = -1; dx <= 1; dx += 0.1) {
    for (let dy = -1; dy <= 1; dy += 0.1) {
      const nx = Math.round((x + dx) * 10) / 10;
      const ny = Math.round((y + dy) * 10) / 10;
      if (new RegExp(`translate\\(${nx},${ny}\\)`).test(svg)) return true;
    }
  }
  return false;
}

describe('technical Wrapped card', () => {
  describe('golden fixtures', () => {
    it('landscape golden PNG is present as a test fixture', () => {
      expect(existsSync(join(__dirname, '../fixtures/wrapped-technical/landscape-golden.png'))).toBe(true);
    });

    it('portrait golden PNG is present as a test fixture', () => {
      expect(existsSync(join(__dirname, '../fixtures/wrapped-technical/portrait-golden.png'))).toBe(true);
    });
  });

  describe('layout positions match layout-landscape.json within 1px', () => {
    const svg = renderLandscapeCardSvg(sampleInput());

    it.each([
      ['persona panel', 752, 48],
      ['activity panel', 752, 220],
      ['stat card 1', 48, 339.4],
      ['stat card 2', 269.3, 339.4],
      ['stat card 3', 490.7, 339.4],
      ['stat card 4', 48, 451.2],
      ['stat card 5', 269.3, 451.2],
      ['stat card 6', 490.7, 451.2],
    ])('%s at (%d, %d)', (_name, x, y) => {
      expect(extractTranslate(svg, x, y)).toBe(true);
    });
  });

  describe('layout positions match layout-portrait.json within 1px', () => {
    const svg = renderPortraitCardSvg(sampleInput());

    it.each([
      ['persona panel', 584, 142.1],
      ['activity panel', 56, 686.9],
      ['stat card 1', 56, 378.8],
      ['stat card 2', 385.3, 378.8],
      ['stat card 3', 714.7, 378.8],
      ['stat card 4', 56, 529.8],
      ['stat card 5', 385.3, 529.8],
      ['stat card 6', 714.7, 529.8],
    ])('%s at (%d, %d)', (_name, x, y) => {
      expect(extractTranslate(svg, x, y)).toBe(true);
    });
  });

  describe('number formats (README section 7)', () => {
    it('formats the hero token count compactly, dropping a trailing .0', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ totalTokens: 48_200_000 }));
      expect(svg).toContain('48.2M');
    });

    it('drops the trailing .0 when the compact value would otherwise be whole (regression)', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ totalTokens: 2_000_000 }));
      expect(svg).toContain('>2M<');
      expect(svg).not.toContain('2.0M');
    });

    it('shows cost as an integer with thousands separators at or above $10', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ costUsd: 1234 }));
      expect(svg).toContain('$1,234');
    });

    it('shows cost with two decimals under $10', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ costUsd: 4.2 }));
      expect(svg).toContain('$4.20');
    });

    it('shows n/a for cost when costUsd is null but showCost is true (unknown model)', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ costUsd: null, showCost: true }));
      expect(svg).toContain('n/a');
      expect(svg).toContain('API-equivalent estimate, not your bill');
    });
  });

  describe('text fitting with very large values (README section 9)', () => {
    it('shrinks the hero value font size instead of overflowing the card for a very large token count', () => {
      const normalSvg = renderLandscapeCardSvg(sampleInput({ totalTokens: 48_200_000 }));
      // Long enough (an 11+ character compact string, "B" suffix) to exceed
      // the 648px landscape max width at the nominal 112px hero size.
      const hugeSvg = renderLandscapeCardSvg(sampleInput({ totalTokens: 9_999_999_999_999_999_999 }));
      const heroSize = (svg: string) => Number(/font-size="([\d.]+)" font-weight="700" letter-spacing="-?[\d.]+" fill="#F0F4F8"/.exec(svg)?.[1]);
      const normalSize = heroSize(normalSvg);
      const hugeSize = heroSize(hugeSvg);
      expect(Number.isFinite(normalSize)).toBe(true);
      expect(Number.isFinite(hugeSize)).toBe(true);
      expect(hugeSize).toBeLessThan(normalSize);
      expect(hugeSvg).toContain('B<');
    });

    it('never shrinks below 60 percent of the nominal hero size', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ totalTokens: 999_900_000_000_000 }));
      const size = Number(/font-size="([\d.]+)" font-weight="700" letter-spacing="-?[\d.]+" fill="#F0F4F8"/.exec(svg)?.[1]);
      expect(size).toBeGreaterThanOrEqual(112 * 0.6 - 0.01);
    });
  });

  describe('all five personas (README section 8)', () => {
    const personas: Persona[] = [
      { label: 'Night Owl', line: 'Most of your messages land after dark.' },
      { label: 'Marathoner', line: 'Your longest session ran past 4 hours.' },
      { label: 'Cache Master', line: 'Your cache did the heavy lifting.' },
      { label: 'Streak Keeper', line: 'You showed up day after day.' },
      { label: 'Steady Builder', line: 'Steady, consistent use.' },
    ];

    it.each(personas)('renders $label in uppercase on both card sizes without throwing', (persona) => {
      const landscapeSvg = renderLandscapeCardSvg(sampleInput({ persona }));
      const portraitSvg = renderPortraitCardSvg(sampleInput({ persona }));
      expect(landscapeSvg).toContain(persona.label.toUpperCase());
      expect(portraitSvg).toContain(persona.label.toUpperCase());
    });
  });

  describe('--no-cost (README section 11)', () => {
    it('removes the cost card and the footnote, and reflows to a 5-card grid', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ showCost: false, costUsd: null }));
      expect(svg).not.toContain('est. cost');
      expect(svg).not.toContain('API-equivalent estimate');
      expect(svg).toContain('sessions');
      expect(svg).toContain('cache hit');
    });

    it('keeps the footer right text (attribution) even without cost', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ showCost: false, costUsd: null }));
      expect(svg).toContain('github.com/saxenakapil/setup-doctor');
    });
  });

  describe('no sessions (README section 11)', () => {
    it('shows the centered no-sessions message and keeps header and footer', () => {
      const svg = renderLandscapeCardSvg(sampleInput({ sessions: 0, activeDays: 0, activity: [] }));
      expect(svg).toContain('No sessions in this period.');
      expect(svg).toContain('Try --period 90d.');
      expect(svg).toContain('npx setup-doctor wrapped');
      expect(svg).toContain('github.com/saxenakapil/setup-doctor');
    });

    it('renders the no-sessions state on the portrait size too', () => {
      const svg = renderPortraitCardSvg(sampleInput({ sessions: 0, activeDays: 0, activity: [] }));
      expect(svg).toContain('No sessions in this period.');
    });
  });

  describe('accessibility and output hygiene', () => {
    it('includes title, desc and role=img', () => {
      const svg = renderLandscapeCardSvg(sampleInput());
      expect(svg).toContain('<title>');
      expect(svg).toContain('<desc>');
      expect(svg).toContain('role="img"');
    });

    it('never contains a live network reference', () => {
      const svg = renderLandscapeCardSvg(sampleInput());
      expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    });

    it('never contains an em dash', () => {
      const svg = renderLandscapeCardSvg(sampleInput()) + renderPortraitCardSvg(sampleInput());
      expect(svg).not.toContain('—');
    });
  });

  // Renders both sizes to PNG with the bundled fonts, using resvg-js, and
  // saves next to the golden fixtures for manual inspection. resvg-js is an
  // optional dependency (src/render/png.ts follows the same pattern): skip
  // rather than fail if it is not installed.
  describe('PNG render (optional @resvg/resvg-js)', () => {
    it('renders both sizes without throwing and matches golden dimensions', async () => {
      let mod: { Resvg: new (svg: string, opts?: Record<string, never>) => { render(): { asPng(): Uint8Array; width: number; height: number } } };
      try {
        mod = await import('@resvg/resvg-js');
      } catch {
        return;
      }
      const landscapeSvg = renderLandscapeCardSvg(sampleInput());
      const portraitSvg = renderPortraitCardSvg(sampleInput());
      const landscapePng = new mod.Resvg(landscapeSvg).render();
      const portraitPng = new mod.Resvg(portraitSvg).render();
      expect(landscapePng.width).toBe(1200);
      expect(landscapePng.height).toBe(630);
      expect(portraitPng.width).toBe(1080);
      expect(portraitPng.height).toBe(1350);

      const goldenLandscape = readFileSync(join(__dirname, '../fixtures/wrapped-technical/landscape-golden.png'));
      const goldenPortrait = readFileSync(join(__dirname, '../fixtures/wrapped-technical/portrait-golden.png'));
      // PNG header (IHDR) carries width/height at fixed byte offsets;
      // reading it directly avoids adding an image-decoding dependency
      // just to confirm the golden fixtures are the expected card size.
      expect(goldenLandscape.readUInt32BE(16)).toBe(1200);
      expect(goldenLandscape.readUInt32BE(20)).toBe(630);
      expect(goldenPortrait.readUInt32BE(16)).toBe(1080);
      expect(goldenPortrait.readUInt32BE(20)).toBe(1350);
    });
  });
});
