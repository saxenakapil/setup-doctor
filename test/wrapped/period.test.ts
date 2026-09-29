import { describe, expect, it } from 'vitest';
import { localDateKey, localHour, localWeekday, parsePeriodFlag, resolvePeriodBounds } from '../../src/wrapped/period.js';

describe('parsePeriodFlag', () => {
  it('accepts the four fixed keywords', () => {
    expect(parsePeriodFlag('7d')).toEqual({ kind: '7d', tz: undefined });
    expect(parsePeriodFlag('30d')).toEqual({ kind: '30d', tz: undefined });
    expect(parsePeriodFlag('ytd')).toEqual({ kind: 'ytd', tz: undefined });
    expect(parsePeriodFlag('all')).toEqual({ kind: 'all', tz: undefined });
  });

  it('accepts an explicit date range', () => {
    expect(parsePeriodFlag('2026-01-01:2026-01-31')).toEqual({
      kind: 'range',
      start: '2026-01-01',
      end: '2026-01-31',
      tz: undefined,
    });
  });

  it('rejects an invalid value', () => {
    expect(parsePeriodFlag('last week')).toBeNull();
    expect(parsePeriodFlag('2026/01/01:2026/01/31')).toBeNull();
  });
});

describe('resolvePeriodBounds', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('7d is a 7-day rolling window ending now', () => {
    const bounds = resolvePeriodBounds({ kind: '7d' }, now);
    expect(bounds?.endMs).toBe(now.getTime());
    expect(bounds?.startMs).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  });

  it('all has no lower bound', () => {
    const bounds = resolvePeriodBounds({ kind: 'all' }, now);
    expect(bounds?.startMs).toBe(-Infinity);
  });

  it('ytd starts at local midnight Jan 1 in the given tz', () => {
    const bounds = resolvePeriodBounds({ kind: 'ytd', tz: 'UTC' }, now);
    expect(bounds?.startMs).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('range resolves inclusive local-day boundaries', () => {
    const bounds = resolvePeriodBounds({ kind: 'range', start: '2026-01-01', end: '2026-01-02', tz: 'UTC' }, now);
    expect(bounds?.startMs).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    expect(bounds?.endMs).toBe(Date.parse('2026-01-03T00:00:00.000Z') - 1);
  });

  it('rejects a range where start is after end', () => {
    const bounds = resolvePeriodBounds({ kind: 'range', start: '2026-02-01', end: '2026-01-01', tz: 'UTC' }, now);
    expect(bounds).toBeNull();
  });

  it('rejects a range missing start or end', () => {
    expect(resolvePeriodBounds({ kind: 'range' }, now)).toBeNull();
  });
});

describe('local date/time helpers (UTC, deterministic)', () => {
  it('localDateKey formats as YYYY-MM-DD', () => {
    expect(localDateKey(new Date('2026-03-05T23:30:00.000Z'), 'UTC')).toBe('2026-03-05');
  });

  it('localHour extracts the hour 0-23', () => {
    expect(localHour(new Date('2026-03-05T23:30:00.000Z'), 'UTC')).toBe(23);
    expect(localHour(new Date('2026-03-05T00:00:00.000Z'), 'UTC')).toBe(0);
  });

  it('localWeekday names the day', () => {
    // 2026-01-01 is a Thursday.
    expect(localWeekday(new Date('2026-01-01T10:00:00.000Z'), 'UTC')).toBe('Thursday');
  });

  it('a positive UTC offset shifts the local date forward', () => {
    // 23:30 UTC on Mar 5 is 08:30 the next day at UTC+9 (e.g. Asia/Tokyo).
    expect(localDateKey(new Date('2026-03-05T23:30:00.000Z'), 'Asia/Tokyo')).toBe('2026-03-06');
  });
});
