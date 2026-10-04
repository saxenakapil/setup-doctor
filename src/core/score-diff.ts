// Explains how a score moved between two saved JSON reports (`setup-doctor
// doctor --format json`). Pure: callers parse and validate the files.
//
// A finding's identity is rule, file and message. The line number is left out
// on purpose: editing a file above a problem shifts its line but not the
// problem, so it must not show up as one resolved and one new finding.

import type { Finding, Severity } from './types.js';

// Most severe first, so new critical findings are listed before low ones.
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface ReportSnapshot {
  rulesVersion: string;
  score: number | null;
  band: string | null;
  findings: Finding[];
}

export interface ScoreChange {
  scoreBefore: number | null;
  scoreAfter: number | null;
  bandBefore: string | null;
  bandAfter: string | null;
  rulesVersionChanged: boolean;
  added: Finding[];
  resolved: Finding[];
  unchanged: number;
}

export function findingKey(finding: Finding): string {
  return `${finding.ruleId}\u0000${finding.file ?? ''}\u0000${finding.message}`;
}

function bySeverityThenPlace(a: Finding, b: Finding): number {
  const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (severity !== 0) return severity;
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  const fileA = a.file ?? '';
  const fileB = b.file ?? '';
  if (fileA !== fileB) return fileA < fileB ? -1 : 1;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

export function explainScoreChange(before: ReportSnapshot, after: ReportSnapshot): ScoreChange {
  const beforeKeys = new Set(before.findings.map(findingKey));
  const afterKeys = new Set(after.findings.map(findingKey));
  const added = after.findings.filter((f) => !beforeKeys.has(findingKey(f))).sort(bySeverityThenPlace);
  const resolved = before.findings.filter((f) => !afterKeys.has(findingKey(f))).sort(bySeverityThenPlace);
  const unchanged = after.findings.filter((f) => beforeKeys.has(findingKey(f))).length;
  return {
    scoreBefore: before.score,
    scoreAfter: after.score,
    bandBefore: before.band,
    bandAfter: after.band,
    rulesVersionChanged: before.rulesVersion !== after.rulesVersion,
    added,
    resolved,
    unchanged,
  };
}

export function formatScoreChange(change: ScoreChange): string {
  const lines: string[] = [];
  lines.push(headline(change));
  if (change.rulesVersionChanged) {
    lines.push('Note: the rule set changed between these reports, so some differences come from new or updated rules rather than from your setup.');
  }
  lines.push('');
  lines.push(section(`${change.added.length} new`, change.added, 'no new findings'));
  lines.push(section(`${change.resolved.length} resolved`, change.resolved, 'nothing resolved'));
  lines.push(`${change.unchanged} unchanged`);
  return lines.join('\n');
}

function headline(change: ScoreChange): string {
  if (change.scoreBefore === null || change.scoreAfter === null) {
    return 'Score comparison is unavailable: one of the reports has no score (too few applicable checks).';
  }
  const delta = change.scoreAfter - change.scoreBefore;
  const sign = delta > 0 ? '+' : '';
  const bands = change.bandBefore === change.bandAfter ? `(${change.bandAfter})` : `(${change.bandBefore} -> ${change.bandAfter})`;
  return `Score ${change.scoreBefore} -> ${change.scoreAfter} (${sign}${delta}) ${bands}`;
}

function section(title: string, findings: Finding[], empty: string): string {
  if (findings.length === 0) return `${title}: ${empty}`;
  const rows = findings.map((f) => `  ${f.severity.toUpperCase().padEnd(8)} ${f.ruleId}  ${f.message}`);
  return [`${title}:`, ...rows].join('\n');
}
