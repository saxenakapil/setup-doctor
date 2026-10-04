// Terminal report for `wrapped`. See docs/scope.md section 12 (terminal
// report is not themed). Not the same table as Doctor's; see terminal.ts.

import { totalTokens, type WrappedMetrics } from '../wrapped/metrics.js';
import type { Persona } from '../wrapped/persona.js';
import type { TrendComparison } from '../wrapped/run.js';
import { getAnsi } from './ansi.js';

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function formatCost(costUsd: number | null): string {
  return costUsd === null ? 'n/a' : `$${costUsd < 0.01 && costUsd > 0 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export interface WrappedTerminalInput {
  periodLabel: string;
  metrics: WrappedMetrics;
  persona: Persona;
  showCost: boolean;
  showProjects: boolean;
  priceTableAsOf: string;
  /** Shown beside the cost when set. Null or absent means no projection line. */
  forecastMonthlyUsd?: number | null;
  /** Defaults to no color; pass true only after checking shouldUseColor. */
  useColor?: boolean;
  // Present only when --trend was passed. Null means no well-defined
  // previous period existed (period 'all'); a value renders one summary
  // line, sessions/active days/tokens/cost only -- not busiest hour or any
  // other point-in-time stat, which does not have a meaningful "delta".
  trend?: TrendComparison | null;
}

function formatDelta(n: number, formatMagnitude: (magnitude: number) => string): string {
  if (n === 0) return '(no change)';
  const sign = n > 0 ? '+' : '-';
  return `(${sign}${formatMagnitude(Math.abs(n))})`;
}

function formatCostMagnitude(n: number): string {
  const abs = Math.abs(n);
  return `$${abs < 0.01 && abs > 0 ? abs.toFixed(4) : abs.toFixed(2)}`;
}

function renderTrendLine(trend: TrendComparison, showCost: boolean): string {
  const parts = [
    `Sessions ${formatDelta(trend.deltas.sessions, formatNumber)}`,
    `Active days ${formatDelta(trend.deltas.activeDays, formatNumber)}`,
    `Tokens ${formatDelta(trend.deltas.tokens, formatNumber)}`,
  ];
  if (showCost && trend.deltas.costUsd !== null) parts.push(`Est. cost* ${formatDelta(trend.deltas.costUsd, formatCostMagnitude)}`);
  return `Trend vs ${trend.previousPeriodLabel}: ${parts.join('   ')}`;
}

export function renderWrappedTerminalReport(input: WrappedTerminalInput): string {
  const { metrics } = input;
  const ansi = getAnsi(input.useColor ?? false);

  if (metrics.recordCount === 0) {
    return `Setup Doctor Wrapped  ${input.periodLabel}\n\nNo sessions in this period. Try a wider --period, for example --period 30d or --period all.`;
  }

  const lines: string[] = [];
  lines.push(ansi.bold(`Setup Doctor Wrapped  ${input.periodLabel}`));
  lines.push('');

  const headline = [
    `Sessions ${formatNumber(metrics.sessions)}`,
    `Active days ${formatNumber(metrics.activeDays)}`,
    `Tokens ${formatNumber(totalTokens(metrics))}`,
  ];
  if (input.showCost) {
    const forecast = input.forecastMonthlyUsd;
    const projection = forecast === null || forecast === undefined ? '' : ` (about ${formatCost(forecast)}/month at this rate)`;
    headline.push(`Est. cost* ${formatCost(metrics.cost.totalUsd)}${projection}`);
  }
  lines.push(headline.join('   '));

  if (input.trend) {
    lines.push(renderTrendLine(input.trend, input.showCost));
  } else if (input.trend === null) {
    lines.push(`Trend: not available for --period all (no fixed-length previous period to compare against)`);
  }

  lines.push(
    [
      `Busiest hour ${metrics.busiestHour === null ? 'n/a' : `${String(metrics.busiestHour).padStart(2, '0')}:00`}`,
      `Busiest weekday ${metrics.busiestWeekday ?? 'n/a'}`,
      `Longest streak ${metrics.longestStreakDays} day${metrics.longestStreakDays === 1 ? '' : 's'}`,
    ].join('   '),
  );
  lines.push(`Cache hit rate ${formatPercent(metrics.cacheHitRate)}`);
  lines.push('');

  if (metrics.topModels.length > 0) {
    lines.push(`Top models: ${metrics.topModels.map((m) => `${m.model} (${formatPercent(m.share)})`).join(', ')}`);
  }
  if (metrics.topTools.length > 0) {
    lines.push(`Top tools: ${metrics.topTools.map((t) => t.name).join(', ')}`);
  }
  if (input.showProjects && metrics.topProjects.length > 0) {
    lines.push(`Top projects: ${metrics.topProjects.map((p) => `${p.project} (${formatNumber(p.tokens)} tok)`).join(', ')}`);
  }
  lines.push('');

  lines.push(`Persona: ${ansi.cyan(input.persona.label)}. ${input.persona.line}`);
  lines.push('');

  if (input.showCost) {
    lines.push(`* API-equivalent estimate, not your bill. Price table as of ${input.priceTableAsOf}.`);
    if (metrics.cost.hasUnknownModel) lines.push('  One or more models are not in the price table; their cost shows as n/a.');
  }

  return lines.join('\n');
}
