// Period parsing and IANA-timezone-aware boundary resolution.
// See docs/scope.md section 11.2.

import type { Period } from '../core/types.js';

const RANGE_RE = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/;

/** Parses the --period flag value. Returns null for an invalid value (CLI exits 2). */
export function parsePeriodFlag(raw: string, tz?: string): Period | null {
  if (raw === '7d' || raw === '30d' || raw === 'ytd' || raw === 'all') {
    return { kind: raw, tz };
  }
  const m = RANGE_RE.exec(raw);
  if (!m) return null;
  const [, start, end] = m;
  return { kind: 'range', start, end, tz };
}

export function resolveTz(tz: string | undefined): string {
  return tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function utcOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return asUtc - date.getTime();
}

/** UTC ms timestamp of local midnight for the given y/m/d in `tz`. */
export function localMidnightUtcMs(year: number, month: number, day: number, tz: string): number {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = utcOffsetMs(new Date(guess), tz);
  return guess - offset;
}

/** 'YYYY-MM-DD' for `date` as seen in `tz`. Used for active-day and streak bucketing. */
export function localDateKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function localHour(date: Date, tz: string): number {
  const value = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(date);
  const hour = Number(value);
  return hour === 24 ? 0 : hour;
}

export function localWeekday(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(date);
}

export interface PeriodBounds {
  startMs: number;
  endMs: number;
}

/** Resolves a Period into absolute UTC ms bounds (inclusive). Null for an invalid range. */
export function resolvePeriodBounds(period: Period, now: Date): PeriodBounds | null {
  const tz = resolveTz(period.tz);
  const nowMs = now.getTime();

  switch (period.kind) {
    case '7d':
      return { startMs: nowMs - 7 * 24 * 60 * 60 * 1000, endMs: nowMs };
    case '30d':
      return { startMs: nowMs - 30 * 24 * 60 * 60 * 1000, endMs: nowMs };
    case 'all':
      return { startMs: -Infinity, endMs: Infinity };
    case 'ytd': {
      const year = Number(localDateKey(now, tz).slice(0, 4));
      return { startMs: localMidnightUtcMs(year, 1, 1, tz), endMs: nowMs };
    }
    case 'range': {
      if (!period.start || !period.end) return null;
      const startParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period.start);
      const endParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period.end);
      if (!startParts || !endParts) return null;
      const startMs = localMidnightUtcMs(Number(startParts[1]), Number(startParts[2]), Number(startParts[3]), tz);
      const endMs = localMidnightUtcMs(Number(endParts[1]), Number(endParts[2]), Number(endParts[3]), tz) + 24 * 60 * 60 * 1000 - 1;
      if (startMs > endMs) return null;
      return { startMs, endMs };
    }
  }
}
