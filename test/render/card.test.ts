import { describe, expect, it } from 'vitest';
import { renderLandscapeCardSvg, renderPortraitCardSvg, type CardInput } from '../../src/render/card.js';
import { getTheme, THEME_NAMES } from '../../src/render/themes/index.js';

function baseInput(themeName: (typeof THEME_NAMES)[number]): CardInput {
  return {
    theme: getTheme(themeName),
    agentLabel: 'Claude Code',
    periodLabel: '30 days',
    sessions: 12,
    activeDays: 8,
    totalTokens: 245_000,
    costUsd: 3.42,
    busiestHour: 14,
    busiestWeekday: 'Tuesday',
    longestStreakDays: 5,
    persona: { label: 'Steady Builder', line: 'Steady, consistent use.' },
    activity: Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, level: (i % 5) as 0 | 1 | 2 | 3 | 4 })),
    showProjects: false,
    topProjects: [{ project: 'my-secret-project', tokens: 100_000 }],
  };
}

describe.each([
  ['landscape', renderLandscapeCardSvg, 1200, 630],
  ['portrait', renderPortraitCardSvg, 1080, 1350],
] as const)('%s card', (_name, render, width, height) => {
  it.each(THEME_NAMES)('renders a well-formed, correctly sized SVG for theme %s', (themeName) => {
    const svg = render(baseInput(themeName));
    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${width}"`);
    expect(svg).toContain(`height="${height}"`);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('includes an accessible title and description', () => {
    const svg = render(baseInput('playful'));
    expect(svg).toContain('<title>');
    expect(svg).toContain('<desc>');
    expect(svg).toContain('30 days');
  });

  it('shows the real agent name in the title, not a hardcoded one (regression)', () => {
    const svg = render({ ...baseInput('playful'), agentLabel: 'Codex' });
    expect(svg).toContain('with Codex');
    expect(svg).not.toContain('with Claude Code');
  });

  it('never shows a project name when showProjects is false, even though data was supplied', () => {
    const svg = render(baseInput('playful'));
    expect(svg).not.toContain('my-secret-project');
  });

  it('shows the project name only when showProjects is explicitly true', () => {
    const input = { ...baseInput('playful'), showProjects: true };
    const svg = render(input);
    expect(svg).toContain('my-secret-project');
  });

  it('marks cost with an asterisk and includes the footnote', () => {
    const svg = render(baseInput('playful'));
    expect(svg.toLowerCase()).toContain('est. cost*');
    expect(svg).toContain('API-equivalent estimate, not your bill');
  });

  it('shows "n/a" for cost when costUsd is null (--no-cost or unknown model)', () => {
    const input = { ...baseInput('playful'), costUsd: null };
    const svg = render(input);
    expect(svg).toContain('n/a');
  });

  it('carries the tool command', () => {
    const svg = render(baseInput('technical'));
    expect(svg).toContain('npx setup-doctor wrapped');
  });

  it('never contains a live network reference', () => {
    const svg = render(baseInput('mix'));
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
  });

  it('shrinks the title font-size to fit a long --period range label instead of clipping it (regression)', () => {
    const shortSvg = render(baseInput('mix'));
    const longInput = { ...baseInput('mix'), periodLabel: '2020-01-01 to 2026-09-29' };
    const longSvg = render(longInput);
    const titleSize = (svg: string) => Number(/font-size="(\d+)" font-weight="800"[^>]*>Your last/.exec(svg)?.[1]);
    const shortSize = titleSize(shortSvg);
    const longSize = titleSize(longSvg);
    expect(Number.isFinite(shortSize)).toBe(true);
    expect(Number.isFinite(longSize)).toBe(true);
    expect(longSize).toBeLessThan(shortSize);
    expect(longSvg).toContain('2020-01-01 to 2026-09-29 with Claude Code');
  });

  it('renders the activity strip only for mix (docs/themes.md section 4); technical has its own bespoke grid', () => {
    const playfulSvg = render(baseInput('playful'));
    const mixSvg = render(baseInput('mix'));
    // Activity cells carry their date in a <title>; count occurrences as a proxy for "strip rendered".
    const countDateTitles = (svg: string) => (svg.match(/<title>2026-01-/g) ?? []).length;
    expect(countDateTitles(playfulSvg)).toBe(0);
    expect(countDateTitles(mixSvg)).toBe(30);
  });

  it('renders the technical card\'s own quartile activity grid (docs/design/wrapped-technical/)', () => {
    const svg = render(baseInput('technical'));
    // 30 activity cells rendered as rounded rects colored from TECH_CARD.gridLevels.
    expect((svg.match(/#161E27|#12331F|#1D6B3A|#2FA85B|#3DDC84/g) ?? []).length).toBeGreaterThanOrEqual(30);
  });
});
