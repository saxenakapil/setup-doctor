import { describe, expect, it } from 'vitest';
import { elapsedDaysInBounds, projectMonthlyCost } from '../../src/wrapped/forecast.js';

const DAY = 24 * 60 * 60 * 1000;

describe('projectMonthlyCost', () => {
  it('extrapolates the average daily cost over elapsed days to a 30-day month', () => {
    // $10 over 5 days is $2/day, so about $60 a month.
    expect(projectMonthlyCost(10, 5)).toBeCloseTo(60, 6);
  });

  it('returns null when the cost is unknown', () => {
    expect(projectMonthlyCost(null, 10)).toBeNull();
  });

  it('returns null when the period is too short to project from', () => {
    expect(projectMonthlyCost(10, 2)).toBeNull();
    expect(projectMonthlyCost(10, 3)).not.toBeNull();
  });

  it('omits the projection once the period already spans a month, since it would repeat the total', () => {
    expect(projectMonthlyCost(10, 30)).toBeNull();
    expect(projectMonthlyCost(10, 31)).toBeNull();
  });

  it('returns null for an unbounded period with no elapsed-day count', () => {
    expect(projectMonthlyCost(10, null)).toBeNull();
  });

  it('counts idle days as zero spend, so a quiet week projects lower than a busy one', () => {
    const busy = projectMonthlyCost(70, 7);
    const quiet = projectMonthlyCost(10, 7);
    expect(busy).toBeGreaterThan(quiet ?? Infinity);
  });
});

describe('elapsedDaysInBounds', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');

  it('measures from the period start to now for a rolling period', () => {
    expect(elapsedDaysInBounds({ startMs: now - 7 * DAY, endMs: now }, now)).toBeCloseTo(7, 6);
  });

  it('clamps to now when the period end is in the future', () => {
    expect(elapsedDaysInBounds({ startMs: now - 2 * DAY, endMs: now + 30 * DAY }, now)).toBeCloseTo(2, 6);
  });

  it('returns null for an unbounded period (all)', () => {
    expect(elapsedDaysInBounds({ startMs: -Infinity, endMs: Infinity }, now)).toBeNull();
  });
});
