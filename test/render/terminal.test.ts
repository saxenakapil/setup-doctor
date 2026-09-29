import { describe, expect, it } from 'vitest';
import { renderTerminalReport } from '../../src/render/terminal.js';
import type { CategoryScore } from '../../src/core/scoring.js';
import type { Finding } from '../../src/core/types.js';

const CATEGORIES: CategoryScore[] = [
  { category: 'instructions', weight: 30, applicable: true, deductions: 8, fraction: 22 / 30 },
  { category: 'skills', weight: 25, applicable: true, deductions: 5, fraction: 20 / 25 },
  { category: 'mcp', weight: 15, applicable: true, deductions: 0, fraction: 1 },
  { category: 'plugins', weight: 10, applicable: true, deductions: 0, fraction: 1 },
  { category: 'settings', weight: 10, applicable: true, deductions: 5, fraction: 0.5 },
  { category: 'freshness', weight: 10, applicable: true, deductions: 3, fraction: 0.7 },
];

const FINDING: Finding = {
  ruleId: 'INS-02',
  category: 'instructions',
  severity: 'high',
  file: 'CLAUDE.md',
  message: 'CLAUDE.md is about 5,800 tokens (limit 5,000)',
  why: 'why',
  fix: 'move rarely needed sections into skill files.',
};

describe('renderTerminalReport', () => {
  it('matches the section 12.1 layout shape', () => {
    const text = renderTerminalReport({
      score: 79,
      band: 'Good',
      capped: false,
      categories: CATEGORIES,
      rulesVersion: '1.0.0',
      overheadTokens: 6400,
      findings: [FINDING],
      suppressedCount: 0,
      skipped: [],
    });

    expect(text).toContain('Setup Doctor  score 79/100  (Good)   rules v1.0.0');
    expect(text).toContain('Instruction files  22/30');
    expect(text).not.toContain('\u001b[');
    expect(text).toContain('Skills  20/25');
    expect(text).toContain('Always-loaded context: about 6,400 tokens');
    expect(text).toContain('HIGH  INS-02  CLAUDE.md is about 5,800 tokens (limit 5,000)');
    expect(text).toContain('Fix: move rarely needed sections into skill files.');
    expect(text).toContain('1 finding');
  });

  it('emits ANSI codes only when useColor is true, and the plain text is unchanged either way', () => {
    const input = {
      score: 79,
      band: 'Good',
      capped: false,
      categories: CATEGORIES,
      rulesVersion: '1.0.0',
      overheadTokens: 6400,
      findings: [FINDING],
      suppressedCount: 0,
      skipped: [],
    };
    const plain = renderTerminalReport(input);
    const colored = renderTerminalReport({ ...input, useColor: true });

    expect(colored).toContain('\u001b[');
    expect(colored.replace(/\u001b\[[0-9;]*m/g, '')).toBe(plain);
  });

  it('marks a non-applicable category as n/a instead of a fake score', () => {
    const categories: CategoryScore[] = [
      { category: 'instructions', weight: 30, applicable: true, deductions: 0, fraction: 1 },
      { category: 'skills', weight: 25, applicable: false, deductions: 0, fraction: 0 },
      { category: 'mcp', weight: 15, applicable: false, deductions: 0, fraction: 0 },
      { category: 'plugins', weight: 10, applicable: false, deductions: 0, fraction: 0 },
      { category: 'settings', weight: 10, applicable: false, deductions: 0, fraction: 0 },
      { category: 'freshness', weight: 10, applicable: false, deductions: 0, fraction: 0 },
    ];
    const text = renderTerminalReport({
      score: 100,
      band: 'Excellent',
      capped: false,
      categories,
      rulesVersion: '1.0.0',
      overheadTokens: 0,
      findings: [],
      suppressedCount: 0,
      skipped: [],
    });
    expect(text).toContain('Skills  n/a');
    expect(text).toContain('No findings.');
  });

  it('shows only the first 3 findings of the same rule and file, with a count of the rest', () => {
    const findings: Finding[] = Array.from({ length: 5 }, (_, i) => ({
      ...FINDING,
      line: i + 1,
      message: `Secret-like value in CLAUDE.md:${i + 1} ([REDACTED])`,
    }));
    const text = renderTerminalReport({
      score: 50,
      band: 'Needs work',
      capped: false,
      categories: CATEGORIES,
      rulesVersion: '1.0.0',
      overheadTokens: 100,
      findings,
      suppressedCount: 0,
      skipped: [],
    });
    const occurrences = (text.match(/Secret-like value/g) ?? []).length;
    expect(occurrences).toBe(3);
    expect(text).toContain('... and 2 more like this');
  });

  it('notes the critical cap and suppressed/skipped counts', () => {
    const text = renderTerminalReport({
      score: 74,
      band: 'Needs work',
      capped: true,
      categories: CATEGORIES,
      rulesVersion: '1.0.0',
      overheadTokens: 100,
      findings: [FINDING],
      suppressedCount: 2,
      skipped: [{ path: 'huge.md', reason: 'file exceeds 10 MB' }],
    });
    expect(text).toContain('capped');
    expect(text).toContain('2 suppressed');
    expect(text).toContain('1 file skipped');
  });
});
