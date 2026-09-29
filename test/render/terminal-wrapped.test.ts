import { describe, expect, it } from 'vitest';
import { renderWrappedTerminalReport } from '../../src/render/terminal-wrapped.js';
import type { WrappedMetrics } from '../../src/wrapped/metrics.js';

function baseMetrics(overrides: Partial<WrappedMetrics> = {}): WrappedMetrics {
  return {
    recordCount: 20,
    sessions: 5,
    activeDays: 4,
    longestStreakDays: 3,
    tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 },
    cacheHitRate: 0.2,
    cost: { totalUsd: 1.2345, hasUnknownModel: false, perModel: [], asOf: '2026-09-29' },
    topModels: [{ model: 'claude-sonnet-5', tokens: 1800, share: 1 }],
    busiestHour: 14,
    busiestWeekday: 'Tuesday',
    longestSessionMs: 3_600_000,
    topTools: [{ name: 'Read', count: 10 }],
    topProjects: [{ project: 'my-project', tokens: 1800 }],
    nightOwlUserRecordFraction: 0,
    ...overrides,
  };
}

const PERSONA = { label: 'Steady Builder' as const, line: 'Steady, consistent use.' };

describe('renderWrappedTerminalReport', () => {
  it('reports "no sessions in this period" when recordCount is 0', () => {
    const text = renderWrappedTerminalReport({
      periodLabel: '7 days',
      metrics: baseMetrics({ recordCount: 0 }),
      persona: PERSONA,
      showCost: true,
      showProjects: true,
      priceTableAsOf: '2026-09-29',
    });
    expect(text).toContain('No sessions in this period');
    expect(text).toContain('--period');
  });

  it('includes headline numbers, persona and footnote', () => {
    const text = renderWrappedTerminalReport({
      periodLabel: '30 days',
      metrics: baseMetrics(),
      persona: PERSONA,
      showCost: true,
      showProjects: true,
      priceTableAsOf: '2026-09-29',
    });
    expect(text).toContain('Sessions 5');
    expect(text).toContain('Active days 4');
    expect(text).toContain('Persona: Steady Builder. Steady, consistent use.');
    expect(text).toContain('API-equivalent estimate, not your bill');
    expect(text).toContain('my-project');
  });

  it('emits ANSI codes only when useColor is true, and the plain text is unchanged either way', () => {
    const input = {
      periodLabel: '30 days',
      metrics: baseMetrics(),
      persona: PERSONA,
      showCost: true,
      showProjects: true,
      priceTableAsOf: '2026-09-29',
    };
    const plain = renderWrappedTerminalReport(input);
    const colored = renderWrappedTerminalReport({ ...input, useColor: true });

    expect(colored).toContain('\u001b[');
    expect(colored.replace(/\u001b\[[0-9;]*m/g, '')).toBe(plain);
  });

  it('omits cost entirely when showCost is false', () => {
    const text = renderWrappedTerminalReport({
      periodLabel: '30 days',
      metrics: baseMetrics(),
      persona: PERSONA,
      showCost: false,
      showProjects: true,
      priceTableAsOf: '2026-09-29',
    });
    expect(text).not.toContain('Est. cost');
    expect(text).not.toContain('API-equivalent');
  });

  it('omits projects when showProjects is false', () => {
    const text = renderWrappedTerminalReport({
      periodLabel: '30 days',
      metrics: baseMetrics(),
      persona: PERSONA,
      showCost: true,
      showProjects: false,
      priceTableAsOf: '2026-09-29',
    });
    expect(text).not.toContain('my-project');
  });

  it('notes when a model is unknown to the price table', () => {
    const text = renderWrappedTerminalReport({
      periodLabel: '30 days',
      metrics: baseMetrics({ cost: { totalUsd: null, hasUnknownModel: true, perModel: [], asOf: '2026-09-29' } }),
      persona: PERSONA,
      showCost: true,
      showProjects: true,
      priceTableAsOf: '2026-09-29',
    });
    expect(text).toContain('n/a');
    expect(text.toLowerCase()).toContain('not in the price table');
  });
});
