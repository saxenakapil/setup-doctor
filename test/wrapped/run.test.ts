// Real fixture data spanning two adjacent 7-day windows (test/fixtures/
// wrapped-trend/home), not a real user's usage. An explicit --period range
// is used throughout (rather than 7d/30d) so these tests never depend on
// the real current date the way a rolling window would.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runWrapped } from '../../src/wrapped/run.js';

const TREND_HOME = join(__dirname, '..', 'fixtures', 'wrapped-trend', 'home');
const WRAPPED_HOME = join(__dirname, '..', 'fixtures', 'wrapped', 'home');

describe('runWrapped: --trend', () => {
  it('is absent from the report when trend was not requested', async () => {
    const result = await runWrapped({ agent: 'claude', homeDir: TREND_HOME, periodFlag: '2026-01-08:2026-01-14', tz: 'UTC' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.trend).toBeUndefined();
  });

  it('is null for --period all (no fixed-length previous period exists)', async () => {
    const result = await runWrapped({ agent: 'claude', homeDir: TREND_HOME, periodFlag: 'all', tz: 'UTC', trend: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.trend).toBeNull();
  });

  it('compares the current period against the immediately preceding period of the same length, using real fixture data', async () => {
    const result = await runWrapped({ agent: 'claude', homeDir: TREND_HOME, periodFlag: '2026-01-08:2026-01-14', tz: 'UTC', trend: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { report } = result;

    // Current window (2026-01-08..14): two sessions, 750 tokens total.
    expect(report.metrics.sessions).toBe(2);
    // Previous window (2026-01-01..07, the 7 days immediately before): one session, 150 tokens.
    expect(report.trend?.previous.sessions).toBe(1);
    expect(report.trend?.previousPeriodLabel).toBe('previous 7 days');
    expect(report.trend?.deltas).toEqual({ sessions: 1, activeDays: 1, tokens: 600, costUsd: expect.any(Number) });
  });

  it('never lets a previous-period record leak into the current period\'s own metrics, or vice versa', async () => {
    const result = await runWrapped({ agent: 'claude', homeDir: TREND_HOME, periodFlag: '2026-01-08:2026-01-14', tz: 'UTC', trend: true });
    if (!result.ok) return;
    // The single-fetch-then-split implementation must not double count: current + previous sessions must equal the total distinct sessions in the fixture (3).
    expect(result.report.metrics.sessions + (result.report.trend?.previous.sessions ?? 0)).toBe(3);
  });

  it('reports a delta of 0 sessions/tokens and "no previous data" shape when the previous window is genuinely empty', async () => {
    // A window far before any fixture data: current has nothing, previous has nothing either.
    const result = await runWrapped({ agent: 'claude', homeDir: WRAPPED_HOME, periodFlag: '2020-06-08:2020-06-14', tz: 'UTC', trend: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.trend?.previous.recordCount).toBe(0);
    expect(result.report.trend?.deltas).toEqual({ sessions: 0, activeDays: 0, tokens: 0, costUsd: null });
  });
});
