// Tool handlers for MCP server mode (docs/notes.md backlog: "MCP server
// mode"). Read-only: exposes the same runDoctor()/runWrapped() the CLI
// already uses, no --fix equivalent. Kept separate from server.ts (which
// only does SDK wiring) so these are testable as plain async functions,
// without a live stdio transport.

import { runDoctor } from '../core/runner.js';
import { filterByMinSeverity } from '../core/findings.js';
import { renderJsonReport } from '../render/json.js';
import { runWrapped } from '../wrapped/run.js';
import { loadSqlite } from '../wrapped/sqlite-loader.js';
import { VERSION } from '../version.js';
import type { Agent, Scope, Severity } from '../core/types.js';

export interface McpToolTextResult {
  [x: string]: unknown;
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
}

function textResult(text: string, isError = false): McpToolTextResult {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}

export interface DoctorToolArgs {
  path?: string;
  agent?: string;
  scope?: string;
  minSeverity?: string;
}

// homeDirOverride is not part of the tool's public schema (a real client
// has no reason to pick a different home directory); it exists only so
// tests can point this at a fixture instead of the real machine's home,
// the same pattern main()'s own homeDirOverride parameter already uses.
export async function handleDoctorTool(args: DoctorToolArgs, homeDirOverride?: string): Promise<McpToolTextResult> {
  const report = await runDoctor({
    path: args.path,
    agent: (args.agent as Agent | 'all' | undefined) ?? 'auto',
    scope: (args.scope as Scope | 'all' | undefined) ?? 'all',
    homeDir: homeDirOverride,
  });

  if (report.agentsDetected.length === 0) {
    return textResult('Nothing to check. No supported agent setup was detected. Pass "agent" to check a specific one, or "path" to point at a project.');
  }

  const findings = args.minSeverity ? filterByMinSeverity(report.findings, args.minSeverity as Severity) : report.findings;
  const json = renderJsonReport({
    toolVersion: VERSION,
    rulesVersion: report.rulesVersion,
    theme: 'playful',
    agentsDetected: report.agentsDetected,
    score: report.score,
    band: report.band,
    capped: report.capped,
    categories: report.categories,
    overheadTokens: report.overheadTokens,
    findings,
    suppressed: report.suppressed,
    skipped: report.skipped,
    warnings: report.warnings,
  });
  return textResult(JSON.stringify(json, null, 2));
}

export interface WrappedToolArgs {
  agent?: string;
  period?: string;
  tz?: string;
  anonymize?: boolean;
}

export async function handleWrappedTool(args: WrappedToolArgs, homeDirOverride?: string): Promise<McpToolTextResult> {
  const agent = (args.agent as Agent | undefined) ?? 'claude';

  if (agent === 'cursor' && !(await loadSqlite())) {
    return textResult(
      `Wrapped for cursor needs Node 22.5 or later (it reads Cursor's local database via the built-in node:sqlite module).\nYour Node version: ${process.version}`,
    );
  }

  const periodFlag = args.period ?? '30d';
  const result = await runWrapped({ agent, periodFlag, tz: args.tz, homeDir: homeDirOverride });
  if (!result.ok) {
    return textResult(`Invalid period: ${periodFlag}`, true);
  }

  const anonymize = args.anonymize === true;
  const report = result.report;
  const json = {
    schemaVersion: 1 as const,
    toolVersion: VERSION,
    period: report.period,
    periodLabel: report.periodLabel,
    tz: report.tz,
    metrics: { ...report.metrics, topProjects: anonymize ? [] : report.metrics.topProjects },
    persona: report.persona,
  };
  return textResult(JSON.stringify(json, null, 2));
}
