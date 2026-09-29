// Terminal report. See docs/scope.md section 12.1. Not themed; NO_COLOR /
// non-TTY handling and ANSI color are added when the tech-stack calls for it.

import type { CategoryScore } from '../core/scoring.js';
import type { Category, Finding, Severity, Skipped } from '../core/types.js';

const CATEGORY_LABELS: Record<Category, string> = {
  instructions: 'Instruction files',
  skills: 'Skills',
  mcp: 'MCP',
  plugins: 'Plugins',
  settings: 'Settings',
  freshness: 'Freshness',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

const CATEGORY_ORDER: Category[] = ['instructions', 'skills', 'mcp', 'plugins', 'settings', 'freshness'];
const MAX_PER_GROUP = 3;

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function renderScoreLine(score: number | null, band: string | null, capped: boolean, rulesVersion: string): string {
  if (score === null) {
    return `Setup Doctor  Not enough to score   rules v${rulesVersion}`;
  }
  const cappedNote = capped ? ' (capped: a critical finding limits the score to 74)' : '';
  return `Setup Doctor  score ${score}/100  (${band})${cappedNote}   rules v${rulesVersion}`;
}

function renderCategoryLine(categories: CategoryScore[]): string {
  const parts = CATEGORY_ORDER.map((category) => {
    const c = categories.find((x) => x.category === category);
    if (!c) return `${CATEGORY_LABELS[category]}  n/a`;
    if (!c.applicable) return `${CATEGORY_LABELS[category]}  n/a`;
    const displayed = Math.max(0, Math.round(c.fraction * c.weight));
    return `${CATEGORY_LABELS[category]}  ${displayed}/${c.weight}`;
  });
  return parts.join('   ');
}

interface FindingGroup {
  key: string;
  items: Finding[];
}

function groupFindings(findings: Finding[]): FindingGroup[] {
  const order: string[] = [];
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.ruleId}|${f.file ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)?.push(f);
  }
  return order.map((key) => ({ key, items: groups.get(key) as Finding[] }));
}

function renderFinding(f: Finding): string {
  const label = SEVERITY_LABELS[f.severity].padEnd(4);
  const lines = [`${label}  ${f.ruleId}  ${f.message}`, `      Fix: ${f.fix}`];
  return lines.join('\n');
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) return 'No findings.';
  const groups = groupFindings(findings);
  const lines: string[] = [];
  for (const group of groups) {
    const shown = group.items.slice(0, MAX_PER_GROUP);
    for (const f of shown) lines.push(renderFinding(f));
    if (group.items.length > MAX_PER_GROUP) {
      lines.push(`      ... and ${group.items.length - MAX_PER_GROUP} more like this`);
    }
  }
  return lines.join('\n');
}

export interface TerminalReportInput {
  score: number | null;
  band: string | null;
  capped: boolean;
  categories: CategoryScore[];
  rulesVersion: string;
  overheadTokens: number;
  findings: Finding[];
  suppressedCount: number;
  skipped: Skipped[];
  outputPaths?: string[];
}

export function renderTerminalReport(input: TerminalReportInput): string {
  const sections: string[] = [];

  sections.push(renderScoreLine(input.score, input.band, input.capped, input.rulesVersion));
  sections.push('');
  if (input.score !== null) {
    sections.push(renderCategoryLine(input.categories));
    sections.push('');
    sections.push(`Always-loaded context: about ${formatNumber(input.overheadTokens)} tokens`);
    sections.push('');
  }
  sections.push(renderFindings(input.findings));

  const summaryParts = [`${input.findings.length} finding${input.findings.length === 1 ? '' : 's'}`];
  if (input.suppressedCount > 0) summaryParts.push(`${input.suppressedCount} suppressed`);
  if (input.skipped.length > 0) summaryParts.push(`${input.skipped.length} file${input.skipped.length === 1 ? '' : 's'} skipped`);
  if (input.outputPaths && input.outputPaths.length > 0) {
    summaryParts.push(`written to ${input.outputPaths.join(', ')}`);
  }
  sections.push('');
  sections.push(summaryParts.join(', '));

  return sections.join('\n');
}
