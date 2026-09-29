// Terminal report. See docs/scope.md section 12.1. Not themed. Color is
// opt-in via TerminalReportInput.ansi (see src/render/ansi.ts); the caller
// decides NO_COLOR / non-TTY / --ci, this module just applies the result.

import type { CategoryScore } from '../core/scoring.js';
import type { Agent, Category, Finding, Severity, Skipped } from '../core/types.js';
import { getAnsi, type Ansi } from './ansi.js';

const AGENT_LABELS: Record<Agent, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  copilot: 'Copilot',
};

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

function colorForScore(score: number, ansi: Ansi): Ansi['green'] {
  if (score >= 90) return ansi.green;
  if (score >= 75) return ansi.cyan;
  if (score >= 50) return ansi.yellow;
  return ansi.red;
}

function renderScoreLine(score: number | null, band: string | null, capped: boolean, rulesVersion: string, ansi: Ansi): string {
  if (score === null) {
    return `Setup Doctor  Not enough to score   rules v${rulesVersion}`;
  }
  const cappedNote = capped ? ' (capped: a critical finding limits the score to 74)' : '';
  const scoreText = colorForScore(score, ansi)(ansi.bold(`score ${score}/100`));
  return `Setup Doctor  ${scoreText}  (${band})${cappedNote}   rules v${rulesVersion}`;
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

function colorForSeverity(severity: Severity, ansi: Ansi): Ansi['red'] {
  if (severity === 'critical') return ansi.boldRed;
  if (severity === 'high') return ansi.red;
  if (severity === 'medium') return ansi.yellow;
  return ansi.gray;
}

function renderFinding(f: Finding, ansi: Ansi): string {
  const label = colorForSeverity(f.severity, ansi)(SEVERITY_LABELS[f.severity].padEnd(4));
  const lines = [`${label}  ${ansi.bold(f.ruleId)}  ${f.message}`, `      Fix: ${f.fix}`];
  if (f.sharedWith && f.sharedWith.length > 0) {
    const others = f.sharedWith.map((a) => AGENT_LABELS[a]).join(', ');
    lines.push(ansi.dim(`      Also affects: ${others} (same file)`));
  }
  return lines.join('\n');
}

function renderFindings(findings: Finding[], ansi: Ansi): string {
  if (findings.length === 0) return 'No findings.';
  const groups = groupFindings(findings);
  const lines: string[] = [];
  for (const group of groups) {
    const shown = group.items.slice(0, MAX_PER_GROUP);
    for (const f of shown) lines.push(renderFinding(f, ansi));
    if (group.items.length > MAX_PER_GROUP) {
      lines.push(ansi.dim(`      ... and ${group.items.length - MAX_PER_GROUP} more like this`));
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
  /** Defaults to no color; pass true only after checking shouldUseColor. */
  useColor?: boolean;
}

export function renderTerminalReport(input: TerminalReportInput): string {
  const ansi = getAnsi(input.useColor ?? false);
  const sections: string[] = [];

  sections.push(renderScoreLine(input.score, input.band, input.capped, input.rulesVersion, ansi));
  sections.push('');
  if (input.score !== null) {
    sections.push(renderCategoryLine(input.categories));
    sections.push('');
    sections.push(`Always-loaded context: about ${formatNumber(input.overheadTokens)} tokens`);
    sections.push('');
  }
  sections.push(renderFindings(input.findings, ansi));

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
