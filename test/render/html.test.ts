import { describe, expect, it } from 'vitest';
import { escapeHtml, renderHtmlReport, type HtmlReportInput } from '../../src/render/html.js';
import { getTheme, THEME_NAMES } from '../../src/render/themes/index.js';
import type { CategoryScore } from '../../src/core/scoring.js';
import type { Finding } from '../../src/core/types.js';

const CATEGORIES: CategoryScore[] = [
  { category: 'instructions', weight: 30, applicable: true, deductions: 8, fraction: 22 / 30 },
  { category: 'skills', weight: 25, applicable: true, deductions: 5, fraction: 20 / 25 },
  { category: 'mcp', weight: 15, applicable: true, deductions: 0, fraction: 1 },
  { category: 'plugins', weight: 10, applicable: false, deductions: 0, fraction: 0 },
  { category: 'settings', weight: 10, applicable: true, deductions: 5, fraction: 0.5 },
  { category: 'freshness', weight: 10, applicable: true, deductions: 3, fraction: 0.7 },
];

const FINDINGS: Finding[] = [
  {
    ruleId: 'INS-08',
    category: 'instructions',
    severity: 'critical',
    file: 'CLAUDE.md',
    line: 3,
    message: 'Secret-like value in CLAUDE.md:3 ([REDACTED])',
    why: 'why',
    fix: 'Remove the value, rotate the credential, and read it from an environment variable instead.',
  },
  {
    ruleId: 'INS-02',
    category: 'instructions',
    severity: 'high',
    file: 'CLAUDE.md',
    message: 'CLAUDE.md is about 5,800 tokens (limit 5,000)',
    why: 'why',
    fix: 'Move rarely needed sections into skill files.',
  },
];

function baseInput(themeName: (typeof THEME_NAMES)[number]): HtmlReportInput {
  return {
    toolVersion: '0.1.0',
    rulesVersion: '1.0.0',
    theme: getTheme(themeName),
    score: 79,
    band: 'Good',
    capped: false,
    categories: CATEGORIES,
    overheadTokens: 6400,
    findings: FINDINGS,
    highAndCriticalCount: 2,
    suppressed: [],
    skipped: [],
  };
}

describe('escapeHtml', () => {
  it('escapes all five special characters', () => {
    expect(escapeHtml(`<a href="x">it's & "quoted"</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; &quot;quoted&quot;&lt;/a&gt;',
    );
  });
});

describe('renderHtmlReport', () => {
  it.each(THEME_NAMES)('renders a complete, self-contained document for theme %s', (themeName) => {
    const html = renderHtmlReport(baseInput(themeName));
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('79');
    expect(html).toContain('Good');
    expect(html).toContain('INS-08');
    expect(html).toContain('[REDACTED]');
  });

  it('sets a Content-Security-Policy that blocks network access (default-src none, no remote origins)', () => {
    const html = renderHtmlReport(baseInput('playful'));
    const cspMatch = /Content-Security-Policy" content="([^"]+)"/.exec(html);
    expect(cspMatch).not.toBeNull();
    const csp = cspMatch?.[1] ?? '';
    expect(csp).toContain("default-src 'none'");
    // No directive should allow a remote origin.
    expect(/https?:\/\//.test(csp)).toBe(false);
  });

  it('never emits a live network request: no http(s) URLs anywhere except the printed badge snippet text', () => {
    const html = renderHtmlReport(baseInput('technical'));
    const urls = html.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
    for (const url of urls) {
      // The only http(s) mention allowed anywhere in the report is inside a
      // <code> command sample, and even that must not be a live <script src>,
      // <link href> or fetch-able resource.
      expect(url).not.toMatch(/\.(js|css|woff2?|ttf)(\?|$)/);
    }
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link ');
    expect(html).not.toMatch(/\bfetch\s*\(/);
  });

  it('escapes file-derived text so a hostile finding message cannot inject markup', () => {
    const input = baseInput('playful');
    input.findings = [
      {
        ...FINDINGS[1]!,
        message: '<img src=x onerror=alert(1)>',
        fix: '</style><script>alert(2)</script>',
      },
    ];
    const html = renderHtmlReport(input);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(2)</script>');
  });

  it('gives the category bar fill an explicit block display (regression: a bare <span> ignores width/height and renders as a flat, unfilled track)', () => {
    const html = renderHtmlReport(baseInput('playful'));
    expect(html).toMatch(/\.bar-fill\s*\{[^}]*display:\s*block/);
    expect(html).toContain('<span class="bar-fill" style="width:73%">');
  });

  it('hides a non-applicable category row entirely', () => {
    const html = renderHtmlReport(baseInput('playful'));
    expect(html).not.toContain('Plugins  0/10');
    expect(html).not.toMatch(/Plugins<\/span>\s*<span class="bar-track">/);
  });

  it('shows the privacy footer reminder', () => {
    const html = renderHtmlReport(baseInput('mix'));
    expect(html.toLowerCase()).toContain('may contain file paths');
  });

  it('includes only one inline <script> block, for the severity filter', () => {
    const html = renderHtmlReport(baseInput('playful'));
    const scripts = html.match(/<script(?![^>]*src=)[^>]*>/g) ?? [];
    expect(scripts.length).toBe(1);
    expect(html).toContain('severityFilter');
  });

  it('says "Nice work" with no findings and "Not enough to score" with a null score', () => {
    const clean = renderHtmlReport({ ...baseInput('playful'), findings: [], highAndCriticalCount: 0 });
    expect(clean).toContain('Nice work. No urgent fixes.');

    const notEnough = renderHtmlReport({ ...baseInput('playful'), score: null, band: null, findings: [] });
    expect(notEnough).toContain('Not enough to score');
  });
});
