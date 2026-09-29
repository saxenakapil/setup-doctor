import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAllSessions } from '../../src/wrapped/parse-claude.js';
import { computeMetrics } from '../../src/wrapped/metrics.js';
import type { SessionRecord } from '../../src/core/types.js';

const HOME = join(__dirname, '..', 'fixtures', 'wrapped', 'home');

async function loadFixtureMetrics() {
  const records: SessionRecord[] = [];
  for await (const r of readAllSessions(HOME, null)) records.push(r);
  return computeMetrics(records, 'UTC');
}

describe('computeMetrics (hand-computed against the sample fixture)', () => {
  it('counts sessions, active days and the longest streak', async () => {
    const m = await loadFixtureMetrics();
    expect(m.sessions).toBe(2); // sess-a, sess-b
    expect(m.activeDays).toBe(2); // 2026-01-01, 2026-01-02
    expect(m.longestStreakDays).toBe(2); // consecutive days
  });

  it('totals tokens from deduplicated assistant records only', async () => {
    const m = await loadFixtureMetrics();
    // sonnet-5 turn: 100/50/0/0; haiku-4-5 turn: 200/100/500/0; opus-5-5 turn: 50/20/0/1000
    expect(m.tokens).toEqual({ input: 350, output: 170, cacheRead: 500, cacheWrite: 1000 });
  });

  it('computes cache hit rate as cacheRead / (input + cacheRead + cacheWrite)', async () => {
    const m = await loadFixtureMetrics();
    expect(m.cacheHitRate).toBeCloseTo(500 / 1850, 6);
  });

  it('estimates cost across all three known models', async () => {
    const m = await loadFixtureMetrics();
    // sonnet-5: 100*2e-6 + 50*10e-6 = 0.0007
    // haiku-4-5: 200*1e-6 + 100*5e-6 + 500*1*0.10e-6 = 0.00075
    // opus-5-5: 50*4e-6 + 20*20e-6 + 1000*4*1.25e-6 = 0.0056
    expect(m.cost.totalUsd).toBeCloseTo(0.0007 + 0.00075 + 0.0056, 8);
    expect(m.cost.hasUnknownModel).toBe(false);
  });

  it('ranks top models by token share', async () => {
    const m = await loadFixtureMetrics();
    expect(m.topModels.map((x) => x.model)).toEqual(['claude-opus-5-5', 'claude-haiku-4-5', 'claude-sonnet-5']);
    expect(m.topModels[0]?.tokens).toBe(1070); // 50+20+0+1000
    expect(m.topModels[0]?.share).toBeCloseTo(1070 / 2020, 6);
  });

  it('finds the busiest hour and weekday from user records only', async () => {
    const m = await loadFixtureMetrics();
    // User records at 10:00, 10:00 (Thursday) and 09:00 (Friday) UTC.
    expect(m.busiestHour).toBe(10);
    expect(m.busiestWeekday).toBe('Thursday');
  });

  it('finds the longest session span across all records in one session', async () => {
    const m = await loadFixtureMetrics();
    // sess-a spans 10:00:00.000 to 14:30:00.000 = 4.5 hours.
    expect(m.longestSessionMs).toBe(4.5 * 60 * 60 * 1000);
  });

  it('ranks top tools including slash-command-derived skill names', async () => {
    const m = await loadFixtureMetrics();
    const names = m.topTools.map((t) => t.name).sort();
    expect(names).toEqual(['Bash', 'Edit', 'Read', 'setup-doctor:doctor'].sort());
  });

  it('ranks top projects by token total', async () => {
    const m = await loadFixtureMetrics();
    expect(m.topProjects).toEqual([{ project: 'sample-project', tokens: 2020 }]);
  });

  it('computes the night-owl fraction from user record hours only', async () => {
    const m = await loadFixtureMetrics();
    // None of the 3 user records fall in 22:00-04:00.
    expect(m.nightOwlUserRecordFraction).toBe(0);
  });
});

describe('computeMetrics edge cases', () => {
  it('returns zeroed metrics for an empty record set', () => {
    const m = computeMetrics([], 'UTC');
    expect(m.sessions).toBe(0);
    expect(m.activeDays).toBe(0);
    expect(m.longestStreakDays).toBe(0);
    expect(m.cacheHitRate).toBe(0);
    expect(m.cost.totalUsd).toBeNull();
    expect(m.busiestHour).toBeNull();
    expect(m.longestSessionMs).toBe(0);
  });

  it('a single-day streak of one active day is 1, not 0', () => {
    const record: SessionRecord = {
      agent: 'claude',
      sessionId: 's1',
      project: 'p',
      ts: '2026-01-01T10:00:00.000Z',
      kind: 'user',
      tools: [],
    };
    const m = computeMetrics([record], 'UTC');
    expect(m.longestStreakDays).toBe(1);
  });

  it('a gap in active days resets the streak', () => {
    const mk = (day: string): SessionRecord => ({
      agent: 'claude',
      sessionId: 's1',
      project: 'p',
      ts: `${day}T10:00:00.000Z`,
      kind: 'user',
      tools: [],
    });
    // 01, 02, 03 consecutive, then a gap, then 06 alone.
    const m = computeMetrics(
      ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-06'].map(mk),
      'UTC',
    );
    expect(m.activeDays).toBe(4);
    expect(m.longestStreakDays).toBe(3);
  });
});
