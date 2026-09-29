// Orchestrates a `wrapped` run: parse period, stream sessions, compute
// metrics, classify persona, build the activity strip. See docs/scope.md
// section 11.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { getAdapter } from '../adapters/index.js';
import { computeMetrics, buildActivityStrip, type ActivityCell, type WrappedMetrics } from './metrics.js';
import { classifyPersona, type Persona } from './persona.js';
import { parsePeriodFlag, resolvePeriodBounds, resolveTz } from './period.js';
import type { Agent, Period } from '../core/types.js';

export interface WrappedRunOptions {
  agent: Agent;
  homeDir?: string;
  periodFlag: string;
  tz?: string;
}

export interface WrappedReport {
  period: Period;
  periodLabel: string;
  tz: string;
  metrics: WrappedMetrics;
  persona: Persona;
  activity: ActivityCell[];
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

export async function runWrapped(options: WrappedRunOptions): Promise<WrappedRunResult> {
  const period = parsePeriodFlag(options.periodFlag, options.tz);
  if (!period) return { ok: false, reason: 'invalid-period' };

  const now = new Date();
  const bounds = resolvePeriodBounds(period, now);
  if (!bounds) return { ok: false, reason: 'invalid-period' };

  const tz = resolveTz(options.tz);
  const homeDir = options.homeDir ?? homedir();
  const adapter = getAdapter(options.agent);

  const records = [];
  if (adapter) {
    const ctx = { projectRoot: resolve('.'), homeDir, scope: 'all' as const };
    for await (const record of adapter.readSessions(ctx, period)) records.push(record);
  }

  const metrics = computeMetrics(records, tz);
  const persona = classifyPersona(metrics);
  const activity = buildActivityStrip(records, tz, Math.min(bounds.endMs, now.getTime()));

  return { ok: true, report: { period, periodLabel: periodLabel(period), tz, metrics, persona, activity } };
}
