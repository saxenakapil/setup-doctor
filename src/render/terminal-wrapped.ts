// Terminal report for `wrapped`. See docs/scope.md section 12 (terminal
// report is not themed). Not the same table as Doctor's; see terminal.ts.

import type { WrappedMetrics } from '../wrapped/metrics.js';
import type { Persona } from '../wrapped/persona.js';

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
}

export function renderWrappedTerminalReport(input: WrappedTerminalInput): string {
  const { metrics } = input;

  if (metrics.recordCount === 0) {
    return `Setup Doctor Wrapped  ${input.periodLabel}\n\nNo sessions in this period. Try a wider --period, for example --period 30d or --period all.`;
  }

  const lines: string[] = [];
  lines.push(`Setup Doctor Wrapped  ${input.periodLabel}`);
  lines.push('');

  const headline = [
    `Sessions ${formatNumber(metrics.sessions)}`,
    `Active days ${formatNumber(metrics.activeDays)}`,
    `Tokens ${formatNumber(metrics.tokens.input + metrics.tokens.output + metrics.tokens.cacheRead + metrics.tokens.cacheWrite)}`,
  ];
  if (input.showCost) headline.push(`Est. cost* ${formatCost(metrics.cost.totalUsd)}`);
  lines.push(headline.join('   '));

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

  lines.push(`Persona: ${input.persona.label} — ${input.persona.line}`);
  lines.push('');

  if (input.showCost) {
    lines.push(`* API-equivalent estimate, not your bill. Price table as of ${input.priceTableAsOf}.`);
    if (metrics.cost.hasUnknownModel) lines.push('  One or more models are not in the price table; their cost shows as n/a.');
  }

  return lines.join('\n');
}
