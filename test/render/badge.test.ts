import { describe, expect, it } from 'vitest';
import { renderBadgeSvg, renderEndpointBadgeJson, renderMarkdownSnippet } from '../../src/render/badge.js';
import { THEME_NAMES } from '../../src/render/themes/index.js';

describe('renderBadgeSvg', () => {
  it.each(THEME_NAMES)('renders a two-part flat SVG badge for theme %s with no network refs', (theme) => {
    const svg = renderBadgeSvg({ score: 79, band: 'Good', theme });
    expect(svg).toContain('<svg');
    expect(svg).toContain('setup doctor');
    expect(svg).toContain('79 Good');
    // xmlns="http://www.w3.org/2000/svg" is a namespace *name*, never fetched;
    // strip it before checking for any other, genuinely live http(s) reference.
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('xlink:href');
  });

  it('uses the band color from scope.md section 12.2', () => {
    expect(renderBadgeSvg({ score: 95, band: 'Excellent', theme: 'playful' })).toContain('#3DDC84');
    expect(renderBadgeSvg({ score: 80, band: 'Good', theme: 'playful' })).toContain('#B5D33D');
    expect(renderBadgeSvg({ score: 60, band: 'Needs work', theme: 'playful' })).toContain('#FFB347');
    expect(renderBadgeSvg({ score: 20, band: 'Poor', theme: 'playful' })).toContain('#FF6B6B');
  });

  it('escapes XML special characters', () => {
    const svg = renderBadgeSvg({ score: 79, band: '<Good>', theme: 'playful' });
    expect(svg).not.toContain('<Good>');
    expect(svg).toContain('&lt;Good&gt;');
  });
});

describe('renderEndpointBadgeJson', () => {
  it('matches the shields.io endpoint schema from section 12.2', () => {
    expect(renderEndpointBadgeJson(79, 'Good')).toEqual({
      schemaVersion: 1,
      label: 'setup doctor',
      message: '79 Good',
      color: 'yellowgreen',
    });
  });
});

describe('renderMarkdownSnippet', () => {
  it('matches the printed snippet format from section 12.2', () => {
    expect(renderMarkdownSnippet(79, 'Good')).toBe(
      '![Setup Doctor score](https://img.shields.io/badge/setup%20doctor-79%20Good-yellowgreen)',
    );
  });

  it('never contains a raw space (URL-safe) and never points anywhere but img.shields.io', () => {
    const snippet = renderMarkdownSnippet(50, 'Needs work');
    const urlMatch = /\((https?:\/\/[^)]+)\)/.exec(snippet);
    expect(urlMatch).not.toBeNull();
    const url = urlMatch?.[1] ?? '';
    expect(url.startsWith('https://img.shields.io/')).toBe(true);
    expect(url).not.toContain(' ');
  });
});
