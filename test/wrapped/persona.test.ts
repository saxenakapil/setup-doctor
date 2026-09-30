import { describe, expect, it } from 'vitest';
import { classifyPersona } from '../../src/wrapped/persona.js';
import type { WrappedMetrics } from '../../src/wrapped/metrics.js';

function baseMetrics(overrides: Partial<WrappedMetrics> = {}): WrappedMetrics {
  return {
    recordCount: 10,
    sessions: 1,
    activeDays: 1,
    longestStreakDays: 1,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cacheHitRate: 0,
    cost: { totalUsd: 0, hasUnknownModel: false, perModel: [], asOf: '2026-09-29' },
    topModels: [],
    busiestHour: null,
    busiestWeekday: null,
    longestSessionMs: 0,
    topTools: [],
    topProjects: [],
    nightOwlUserRecordFraction: 0,
    ...overrides,
  };
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;

describe('classifyPersona: boundaries, first match wins', () => {
  it('Night Owl at exactly 40 percent (boundary is inclusive)', () => {
    expect(classifyPersona(baseMetrics({ nightOwlUserRecordFraction: 0.4 })).label).toBe('Night Owl');
  });

  it('not Night Owl just under 40 percent', () => {
    expect(classifyPersona(baseMetrics({ nightOwlUserRecordFraction: 0.39 })).label).not.toBe('Night Owl');
  });

  it('Marathoner just over 4 hours (boundary is exclusive)', () => {
    expect(classifyPersona(baseMetrics({ longestSessionMs: FOUR_HOURS + 1 })).label).toBe('Marathoner');
  });

  it('not Marathoner at exactly 4 hours', () => {
    expect(classifyPersona(baseMetrics({ longestSessionMs: FOUR_HOURS })).label).not.toBe('Marathoner');
  });

  it('Cache Master just over 90 percent (boundary is exclusive)', () => {
    expect(classifyPersona(baseMetrics({ cacheHitRate: 0.9001 })).label).toBe('Cache Master');
  });

  it('not Cache Master at exactly 90 percent', () => {
    expect(classifyPersona(baseMetrics({ cacheHitRate: 0.9 })).label).not.toBe('Cache Master');
  });

  it('Streak Keeper at exactly 14 days (boundary is inclusive)', () => {
    expect(classifyPersona(baseMetrics({ longestStreakDays: 14 })).label).toBe('Streak Keeper');
  });

  it('not Streak Keeper at 13 days', () => {
    expect(classifyPersona(baseMetrics({ longestStreakDays: 13 })).label).not.toBe('Streak Keeper');
  });

  it('Steady Builder is the default with nothing else matching', () => {
    expect(classifyPersona(baseMetrics()).label).toBe('Steady Builder');
  });

  it('Night Owl wins over Marathoner when both would match', () => {
    const metrics = baseMetrics({ nightOwlUserRecordFraction: 0.5, longestSessionMs: FOUR_HOURS + 1 });
    expect(classifyPersona(metrics).label).toBe('Night Owl');
  });

  it('Marathoner wins over Cache Master when both would match', () => {
    const metrics = baseMetrics({ longestSessionMs: FOUR_HOURS + 1, cacheHitRate: 0.95 });
    expect(classifyPersona(metrics).label).toBe('Marathoner');
  });

  it('Cache Master wins over Streak Keeper when both would match', () => {
    const metrics = baseMetrics({ cacheHitRate: 0.95, longestStreakDays: 20 });
    expect(classifyPersona(metrics).label).toBe('Cache Master');
  });

  it('every persona has its card line from docs/scope.md section 11.5', () => {
    expect(classifyPersona(baseMetrics({ nightOwlUserRecordFraction: 0.5 })).line).toBe(
      'Most of your messages land after dark.',
    );
    expect(classifyPersona(baseMetrics({ longestSessionMs: FOUR_HOURS + 1 })).line).toBe(
      'Your longest session ran past 4 hours.',
    );
    expect(classifyPersona(baseMetrics({ cacheHitRate: 0.95 })).line).toBe('Your cache did the heavy lifting.');
    expect(classifyPersona(baseMetrics({ longestStreakDays: 14 })).line).toBe('You showed up day after day.');
    expect(classifyPersona(baseMetrics()).line).toBe('Steady, consistent use.');
  });
});
