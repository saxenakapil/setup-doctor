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

describe('renderWrappedTerminalReport cost projection', () => {
  const base = {
    periodLabel: '30 days',
    metrics: baseMetrics(),
    persona: PERSONA,
    showProjects: false,
    priceTableAsOf: '2026-09-29',
  };

  it('shows the monthly projection beside the cost when one is available', () => {
    const text = renderWrappedTerminalReport({ ...base, showCost: true, forecastMonthlyUsd: 60 });
    expect(text).toContain('Est. cost* $1.23 (about $60.00/month at this rate)');
  });

  it('omits the projection when it is null (unknown cost or too short a period)', () => {
    const text = renderWrappedTerminalReport({ ...base, showCost: true, forecastMonthlyUsd: null });
    expect(text).toContain('Est. cost* $1.23');
    expect(text).not.toContain('/month');
  });

  it('never shows a projection when cost is hidden with --no-cost', () => {
    const text = renderWrappedTerminalReport({ ...base, showCost: false, forecastMonthlyUsd: 60 });
    expect(text).not.toContain('/month');
    expect(text).not.toContain('Est. cost*');
  });
});

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

  describe('--trend', () => {
    function trendComparison(overrides: Partial<{ sessions: number; activeDays: number; tokens: number; costUsd: number | null }> = {}) {
      return {
        previousPeriodLabel: 'previous 7 days',
        previous: baseMetrics({ sessions: 3, activeDays: 2, tokens: { input: 500, output: 200, cacheRead: 0, cacheWrite: 0 } }),
        deltas: { sessions: 2, activeDays: 2, tokens: 1000, costUsd: 0.5, ...overrides },
      };
    }

    it('omits the trend line entirely when trend is undefined (flag not passed)', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: '7 days',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: true,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
      });
      expect(text).not.toContain('Trend');
    });

    it('explains why trend is unavailable when trend is null (period "all")', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: 'all time',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: true,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
        trend: null,
      });
      expect(text).toContain('Trend: not available for --period all');
    });

    it('renders positive deltas with a + sign and the previous-period label', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: '7 days',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: true,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
        trend: trendComparison(),
      });
      expect(text).toContain('Trend vs previous 7 days:');
      expect(text).toContain('Sessions (+2)');
      expect(text).toContain('Tokens (+1,000)');
      expect(text).toContain('Est. cost* (+$0.50)');
    });

    it('renders negative deltas with a - sign, not a double negative or a missing sign', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: '7 days',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: true,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
        trend: trendComparison({ sessions: -3, tokens: -500, costUsd: -0.25 }),
      });
      expect(text).toContain('Sessions (-3)');
      expect(text).toContain('Tokens (-500)');
      expect(text).toContain('Est. cost* (-$0.25)');
    });

    it('renders "(no change)" for a zero delta rather than "(+0)"', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: '7 days',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: true,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
        trend: trendComparison({ activeDays: 0 }),
      });
      expect(text).toContain('Active days (no change)');
    });

    it('omits the cost delta when it is null (an unknown model on either side), without breaking the rest of the line', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: '7 days',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: true,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
        trend: trendComparison({ costUsd: null }),
      });
      expect(text).toContain('Trend vs previous 7 days:');
      expect(text.split('\n').find((l) => l.startsWith('Trend'))).not.toContain('Est. cost*');
    });

    it('omits the cost delta when --no-cost is in effect (showCost: false), even if it is non-null', () => {
      const text = renderWrappedTerminalReport({
        periodLabel: '7 days',
        metrics: baseMetrics(),
        persona: PERSONA,
        showCost: false,
        showProjects: true,
        priceTableAsOf: '2026-09-29',
        trend: trendComparison(),
      });
      expect(text.split('\n').find((l) => l.startsWith('Trend'))).not.toContain('Est. cost*');
    });
  });
});
