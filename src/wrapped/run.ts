// Orchestrates a `wrapped` run: parse period, stream sessions, compute
// metrics, classify persona, build the activity strip. See docs/scope.md
// section 11.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { getAdapter } from '../adapters/index.js';
import { computeMetrics, buildActivityStrip, buildQuartileActivityStrip, totalTokens, type ActivityCell, type WrappedMetrics } from './metrics.js';
import { classifyPersona, type Persona } from './persona.js';
import { localDateKey, parsePeriodFlag, resolvePeriodBounds, resolveTz, type PeriodBounds } from './period.js';
import type { Agent, Period, SessionRecord } from '../core/types.js';

export interface WrappedRunOptions {
  agent: Agent;
  homeDir?: string;
  periodFlag: string;
  tz?: string;
  trend?: boolean;
}

export interface TrendDeltas {
  sessions: number;
  activeDays: number;
  tokens: number;
  // null when either side's cost is unknown (an unrecognized model), same
  // "do not guess" contract estimateCost already follows.
  costUsd: number | null;
}

export interface TrendComparison {
  previousPeriodLabel: string;
  previous: WrappedMetrics;
  deltas: TrendDeltas;
}

export interface WrappedReport {
  period: Period;
  periodLabel: string;
  tz: string;
  metrics: WrappedMetrics;
  persona: Persona;
  activity: ActivityCell[];
  // Same 30 days, but leveled by quartile of active-day counts instead of
  // max-relative (docs/design/wrapped-technical/README.md section 10). Only
  // the technical theme's Wrapped card uses this; every other surface
  // (terminal, JSON, playful/mix cards) keeps using `activity` above.
  quartileActivity: ActivityCell[];
  // Present only when `trend: true` was requested. Null when there is no
  // well-defined "previous period" (period 'all', which already covers
  // every record on disk).
  trend?: TrendComparison | null;
}

export function periodLabel(period: Period): string {
  switch (period.kind) {
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    case 'ytd':
      return 'year to date';
    case 'all':
      return 'all time';
    case 'range':
      return `${period.start} to ${period.end}`;
  }
}

export type WrappedRunResult = { ok: true; report: WrappedReport } | { ok: false; reason: 'invalid-period' };

/** "Previous period of the same length": the bounds immediately preceding `bounds`, spanning the same duration. Null when `bounds` is unbounded (period 'all' has no meaningful predecessor). */
function previousPeriodBounds(bounds: PeriodBounds): PeriodBounds | null {
  if (!Number.isFinite(bounds.startMs) || !Number.isFinite(bounds.endMs)) return null;
  const lengthMs = bounds.endMs - bounds.startMs + 1;
  return { startMs: bounds.startMs - lengthMs, endMs: bounds.startMs - 1 };
}

function inRange(ts: string, bounds: PeriodBounds): boolean {
  const ms = Date.parse(ts);
  return !Number.isNaN(ms) && ms >= bounds.startMs && ms <= bounds.endMs;
}

export async function runWrapped(options: WrappedRunOptions): Promise<WrappedRunResult> {
  const period = parsePeriodFlag(options.periodFlag, options.tz);
  if (!period) return { ok: false, reason: 'invalid-period' };

  const now = new Date();
  const bounds = resolvePeriodBounds(period, now);
  if (!bounds) return { ok: false, reason: 'invalid-period' };

  const tz = resolveTz(options.tz);
  const homeDir = options.homeDir ?? homedir();
  const adapter = getAdapter(options.agent);
  const prevBounds = options.trend ? previousPeriodBounds(bounds) : null;

  // Without --trend, fetch only the requested period, same as before this
  // feature existed. With it, fetch the current period plus the preceding
  // one of the same length in a single pass (one adapter read instead of
  // two), using a widened day-aligned range: `Period`'s 'range' kind only
  // takes whole local days, so the fetch window is padded a day on each
  // side, and the exact millisecond bounds computed above are what
  // actually classify each record afterward, not the fetch window itself.
  const fetchPeriod: Period = prevBounds
    ? {
        kind: 'range',
        start: localDateKey(new Date(prevBounds.startMs - 24 * 60 * 60 * 1000), tz),
        end: localDateKey(new Date(bounds.endMs + 24 * 60 * 60 * 1000), tz),
        tz,
      }
    : period;

  const allRecords: SessionRecord[] = [];
  if (adapter) {
    const ctx = { projectRoot: resolve('.'), homeDir, scope: 'all' as const, ignore: [] };
    for await (const record of adapter.readSessions(ctx, fetchPeriod)) allRecords.push(record);
  }

  const records = prevBounds ? allRecords.filter((r) => inRange(r.ts, bounds)) : allRecords;
  const metrics = computeMetrics(records, tz);
  const persona = classifyPersona(metrics);
  const activity = buildActivityStrip(records, tz, Math.min(bounds.endMs, now.getTime()));
  const quartileActivity = buildQuartileActivityStrip(records, tz, Math.min(bounds.endMs, now.getTime()));

  let trend: TrendComparison | null | undefined;
  if (options.trend) {
    if (!prevBounds) {
      trend = null;
    } else {
      const previousRecords = allRecords.filter((r) => inRange(r.ts, prevBounds));
      const previous = computeMetrics(previousRecords, tz);
      const days = Math.round((bounds.endMs - bounds.startMs) / (24 * 60 * 60 * 1000));
      trend = {
        previousPeriodLabel: `previous ${days} day${days === 1 ? '' : 's'}`,
        previous,
        deltas: {
          sessions: metrics.sessions - previous.sessions,
          activeDays: metrics.activeDays - previous.activeDays,
          tokens: totalTokens(metrics) - totalTokens(previous),
          costUsd: metrics.cost.totalUsd !== null && previous.cost.totalUsd !== null ? metrics.cost.totalUsd - previous.cost.totalUsd : null,
        },
      };
    }
  }

  return { ok: true, report: { period, periodLabel: periodLabel(period), tz, metrics, persona, activity, quartileActivity, trend } };
}
