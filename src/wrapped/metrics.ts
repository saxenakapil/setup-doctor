// Metric aggregation over a period's SessionRecords. See docs/scope.md
// section 11.3.

import { localDateKey, localHour, localWeekday } from './period.js';
import { estimateCost, type CostEstimate, type ModelUsageTotals } from './prices.js';
import type { SessionRecord } from '../core/types.js';

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelShare {
  model: string;
  tokens: number;
  share: number;
}

export interface ProjectTokens {
  project: string;
  tokens: number;
}

export interface ToolCount {
  name: string;
  count: number;
}

export interface WrappedMetrics {
  recordCount: number;
  sessions: number;
  activeDays: number;
  longestStreakDays: number;
  tokens: TokenTotals;
  cacheHitRate: number;
  cost: CostEstimate;
  topModels: ModelShare[];
  busiestHour: number | null;
  busiestWeekday: string | null;
  longestSessionMs: number;
  topTools: ToolCount[];
  topProjects: ProjectTokens[];
  // Fraction (0..1) of user records between 22:00 and 04:00 local time.
  // Feeds persona.ts's Night Owl check.
  nightOwlUserRecordFraction: number;
}

/** Sum of all four token categories. The one total every render surface (terminal, card, trend) shows as a single headline number. */
export function totalTokens(m: Pick<WrappedMetrics, 'tokens'>): number {
  return m.tokens.input + m.tokens.output + m.tokens.cacheRead + m.tokens.cacheWrite;
}

export interface ActivityCell {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * 30 cells, one per day, ending at the local day containing `endMs`. Level
 * is the record count for that day scaled relative to the busiest day in
 * the set (docs/themes.md section 4: "five intensity levels"). Always 30
 * cells regardless of the chosen --period; days outside the fetched period
 * simply have no records and render as empty (level 0).
 */
export function buildActivityStrip(records: SessionRecord[], tz: string, endMs: number, days = 30): ActivityCell[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = localDateKey(new Date(r.ts), tz);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const maxCount = Math.max(1, ...counts.values());

  const cells: ActivityCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(endMs - i * 24 * 60 * 60 * 1000);
    const key = localDateKey(day, tz);
    const count = counts.get(key) ?? 0;
    const level = count === 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4))) as 0 | 1 | 2 | 3 | 4);
    cells.push({ date: key, level });
  }
  return cells;
}

/**
 * Same shape as buildActivityStrip, but levels are quartile-based (the
 * technical Wrapped card's own design spec, docs/design/wrapped-technical/
 * section 10) rather than max-relative: level 1/2/3 are up to the 25th/
 * 50th/75th percentile of *active* days' counts, level 4 is above the
 * 75th. Deliberately separate from buildActivityStrip rather than a shared
 * "strategy" parameter, so playful/mix's existing max-relative look (used
 * elsewhere) is never at risk of changing.
 */
export function buildQuartileActivityStrip(records: SessionRecord[], tz: string, endMs: number, days = 30): ActivityCell[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = localDateKey(new Date(r.ts), tz);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const activeCounts = [...counts.values()].sort((a, b) => a - b);
  const quartile = (p: number): number => {
    if (activeCounts.length === 0) return 0;
    const idx = Math.min(activeCounts.length - 1, Math.floor(p * activeCounts.length));
    return activeCounts[idx] as number;
  };
  const q25 = quartile(0.25);
  const q50 = quartile(0.5);
  const q75 = quartile(0.75);

  const levelFor = (count: number): 0 | 1 | 2 | 3 | 4 => {
    if (count === 0) return 0;
    if (count <= q25) return 1;
    if (count <= q50) return 2;
    if (count <= q75) return 3;
    return 4;
  };

  const cells: ActivityCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(endMs - i * 24 * 60 * 60 * 1000);
    const key = localDateKey(day, tz);
    const count = counts.get(key) ?? 0;
    cells.push({ date: key, level: levelFor(count) });
  }
  return cells;
}

function longestConsecutiveStreak(sortedDateKeys: string[]): number {
  if (sortedDateKeys.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDateKeys.length; i++) {
    const prevMs = Date.parse(`${sortedDateKeys[i - 1]}T00:00:00Z`);
    const curMs = Date.parse(`${sortedDateKeys[i]}T00:00:00Z`);
    const diffDays = Math.round((curMs - prevMs) / (24 * 60 * 60 * 1000));
    current = diffDays === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function computeMetrics(records: SessionRecord[], tz: string): WrappedMetrics {
  const sessionIds = new Set<string>();
  const activeDaySet = new Set<string>();
  const tokens: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const usageByModel = new Map<string, ModelUsageTotals>();
  const tokensByProject = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const weekdayCounts = new Map<string, number>();
  const sessionSpans = new Map<string, { min: number; max: number }>();
  let userRecordCount = 0;
  let nightOwlUserRecords = 0;

  for (const r of records) {
    sessionIds.add(r.sessionId);
    const at = new Date(r.ts);
    activeDaySet.add(localDateKey(at, tz));

    const ms = at.getTime();
    const span = sessionSpans.get(r.sessionId) ?? { min: ms, max: ms };
    span.min = Math.min(span.min, ms);
    span.max = Math.max(span.max, ms);
    sessionSpans.set(r.sessionId, span);

    for (const tool of r.tools) toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);

    if (r.kind === 'user') {
      userRecordCount++;
      const hour = localHour(at, tz);
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      weekdayCounts.set(localWeekday(at, tz), (weekdayCounts.get(localWeekday(at, tz)) ?? 0) + 1);
      if (hour >= 22 || hour < 4) nightOwlUserRecords++;
    }

    if (r.kind === 'assistant' && r.usage) {
      tokens.input += r.usage.input;
      tokens.output += r.usage.output;
      tokens.cacheRead += r.usage.cacheRead;
      tokens.cacheWrite += r.usage.cacheWrite;

      const model = r.model ?? 'unknown';
      const modelTotals = usageByModel.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      modelTotals.input += r.usage.input;
      modelTotals.output += r.usage.output;
      modelTotals.cacheRead += r.usage.cacheRead;
      modelTotals.cacheWrite += r.usage.cacheWrite;
      usageByModel.set(model, modelTotals);

      const recordTokens = r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite;
      tokensByProject.set(r.project, (tokensByProject.get(r.project) ?? 0) + recordTokens);
    }
  }

  const sortedDays = [...activeDaySet].sort();
  const cacheHitDenominator = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  const cost = estimateCost(usageByModel);

  const totalModelTokens = [...usageByModel.values()].reduce((sum, u) => sum + u.input + u.output + u.cacheRead + u.cacheWrite, 0);
  const topModels: ModelShare[] = [...usageByModel.entries()]
    .map(([model, u]) => {
      const modelTokens = u.input + u.output + u.cacheRead + u.cacheWrite;
      return { model, tokens: modelTokens, share: totalModelTokens > 0 ? modelTokens / totalModelTokens : 0 };
    })
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 3);

  let busiestHour: number | null = null;
  let busiestHourCount = -1;
  for (const [hour, count] of hourCounts) {
    if (count > busiestHourCount) {
      busiestHourCount = count;
      busiestHour = hour;
    }
  }

  let busiestWeekday: string | null = null;
  let busiestWeekdayCount = -1;
  for (const [weekday, count] of weekdayCounts) {
    if (count > busiestWeekdayCount) {
      busiestWeekdayCount = count;
      busiestWeekday = weekday;
    }
  }

  let longestSessionMs = 0;
  for (const span of sessionSpans.values()) longestSessionMs = Math.max(longestSessionMs, span.max - span.min);

  const topTools: ToolCount[] = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topProjects: ProjectTokens[] = [...tokensByProject.entries()]
    .map(([project, projectTokens]) => ({ project, tokens: projectTokens }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  return {
    recordCount: records.length,
    sessions: sessionIds.size,
    activeDays: activeDaySet.size,
    longestStreakDays: longestConsecutiveStreak(sortedDays),
    tokens,
    cacheHitRate: cacheHitDenominator > 0 ? tokens.cacheRead / cacheHitDenominator : 0,
    cost,
    topModels,
    busiestHour,
    busiestWeekday,
    longestSessionMs,
    topTools,
    topProjects,
    nightOwlUserRecordFraction: userRecordCount > 0 ? nightOwlUserRecords / userRecordCount : 0,
  };
}
