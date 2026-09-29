import { resolve } from 'node:path';
import { ConfigParseError, loadConfigFile, mergeConfig } from './core/config.js';
import { runDoctor } from './core/runner.js';
import { writeOutputFile } from './core/output.js';
import type { Agent, Scope, Severity } from './core/types.js';
import { ALL_RULES, getRule } from './rules/index.js';
import { renderTerminalReport } from './render/terminal.js';
import { renderHtmlReport } from './render/html.js';
import { renderJsonReport } from './render/json.js';
import { renderBadgeSvg, renderEndpointBadgeJson, renderMarkdownSnippet } from './render/badge.js';
import { getTheme, isThemeName, THEME_NAMES, type ThemeName } from './render/themes/index.js';
import { RULES_VERSION, VERSION } from './version.js';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text + '\n'),
  err: (text) => process.stderr.write(text + '\n'),
};

const COMMANDS = new Set(['doctor', 'wrapped', 'badge', 'rules', 'explain']);
const FORMATS = new Set(['terminal', 'json', 'html']);
const AGENT_VALUES = new Set(['claude', 'codex', 'cursor', 'all']);
const SCOPE_VALUES = new Set(['project', 'global', 'all']);
const MIN_SEVERITY_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const HELP = `setup-doctor ${VERSION}
Score and improve your AI coding agent setup. Local-only, open source.

Usage:
  setup-doctor [doctor] [path]     Audit the setup and print the score
  setup-doctor wrapped             Usage summary and shareable card
  setup-doctor badge               Write README badge files
  setup-doctor rules               List all rules
  setup-doctor explain <RULE_ID>   Explain one rule

Options:
  --help       Show this help
  --version    Show the version
  --format     terminal | json | html (doctor)
  --agent      claude | codex | cursor | all
  --scope      project | global | all
  --theme      playful | technical | mix (doctor --format html, badge)
  --min-severity  low | medium | high | critical (doctor; hides findings, score is unaffected)
  --out <path> Output folder (doctor --format html/json with --out, badge)
  --yes        Overwrite existing output files without asking
  --endpoint   Also write the shields.io endpoint JSON (badge)
  --ci         No prompts, stable output (doctor)
  --fail-under <n>   With --ci, exit 1 if the score is below n (doctor)

Status: doctor and badge are implemented. wrapped is still in progress.
See docs/scope.md for the full plan.`;

function parseArgsAfterCommand(rest: string[]): { flags: Record<string, string | boolean>; positionals: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[arg.slice(2)] = next;
        i++;
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

interface CommonDoctorFlags {
  format: string;
  agentFlag: string;
  scopeFlag: string;
  themeFlag: ThemeName;
  minSeverity: Severity;
  outDir: string;
  yes: boolean;
}

/** Parses and validates flags shared by `doctor` and `badge`. Returns an exit code on error. */
function parseCommonFlags(flags: Record<string, string | boolean>, io: Io): CommonDoctorFlags | number {
  const format = typeof flags.format === 'string' ? flags.format : 'terminal';
  if (!FORMATS.has(format)) {
    io.err(`Unknown --format value: ${format}\nValid values: ${[...FORMATS].join(', ')}`);
    return 2;
  }

  const agentFlag = typeof flags.agent === 'string' ? flags.agent : 'all';
  if (!AGENT_VALUES.has(agentFlag)) {
    io.err(`Unknown --agent value: ${agentFlag}\nValid values: ${[...AGENT_VALUES].join(', ')}`);
    return 2;
  }

  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : 'all';
  if (!SCOPE_VALUES.has(scopeFlag)) {
    io.err(`Unknown --scope value: ${scopeFlag}\nValid values: ${[...SCOPE_VALUES].join(', ')}`);
    return 2;
  }

  const themeRaw = typeof flags.theme === 'string' ? flags.theme : 'playful';
  if (!isThemeName(themeRaw)) {
    io.err(`Unknown --theme value: ${themeRaw}\nValid values: ${THEME_NAMES.join(', ')}`);
    return 2;
  }

  const minSeverityRaw = typeof flags['min-severity'] === 'string' ? flags['min-severity'] : 'low';
  if (!MIN_SEVERITY_VALUES.has(minSeverityRaw)) {
    io.err(`Unknown --min-severity value: ${minSeverityRaw}\nValid values: ${[...MIN_SEVERITY_VALUES].join(', ')}`);
    return 2;
  }

  const outDir = typeof flags.out === 'string' ? resolve(flags.out) : resolve('.');
  const yes = flags.yes === true;

  return {
    format,
    agentFlag,
    scopeFlag,
    themeFlag: themeRaw,
    minSeverity: minSeverityRaw as Severity,
    outDir,
    yes,
  };
}

function filterByMinSeverity<T extends { severity: Severity }>(items: T[], min: Severity): T[] {
  const minRank = SEVERITY_RANK[min];
  return items.filter((f) => SEVERITY_RANK[f.severity] >= minRank);
}

async function runDoctorCommand(rest: string[], io: Io, homeDir?: string): Promise<number> {
  const { flags, positionals } = parseArgsAfterCommand(rest);
  const parsed = parseCommonFlags(flags, io);
  if (typeof parsed === 'number') return parsed;
  const { format, agentFlag, scopeFlag, themeFlag, minSeverity, outDir, yes } = parsed;

  const ci = flags.ci === true;
  let failUnder: number | undefined;
  if (flags['fail-under'] !== undefined) {
    const parsedFailUnder = Number(flags['fail-under']);
    if (!Number.isFinite(parsedFailUnder)) {
      io.err(`Invalid --fail-under value: ${String(flags['fail-under'])}`);
      return 2;
    }
    failUnder = parsedFailUnder;
  }

  try {
    const report = await runDoctor({
      path: positionals[0],
      agent: agentFlag as Agent | 'all',
      scope: scopeFlag as Scope | 'all',
      homeDir,
    });

    if (report.agentsDetected.length === 0) {
      io.out('Nothing to check. Use --agent to specify an agent or pass a path to a project.');
      return 0;
    }

    const displayedFindings = filterByMinSeverity(report.findings, minSeverity);
    const highAndCriticalCount = report.findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length;

    if (format === 'json') {
      const jsonReport = renderJsonReport({
        toolVersion: report.toolVersion,
        rulesVersion: report.rulesVersion,
        theme: themeFlag,
        agentsDetected: report.agentsDetected,
        score: report.score,
        band: report.band,
        capped: report.capped,
        categories: report.categories,
        overheadTokens: report.overheadTokens,
        findings: displayedFindings,
        suppressed: report.suppressed,
        skipped: report.skipped,
        warnings: report.warnings,
      });
      const text = JSON.stringify(jsonReport, null, 2);
      if (flags.out !== undefined) {
        const result = await writeOutputFile(outDir, 'setup-doctor-report.json', text, yes);
        if (!result.ok) {
          io.err(`setup-doctor doctor: ${result.path} ${result.reason}`);
          return 2;
        }
        io.out(`Wrote ${result.path}`);
      } else {
        io.out(text);
      }
    } else if (format === 'terminal') {
      io.out(
        renderTerminalReport({
          score: report.score,
          band: report.band,
          capped: report.capped,
          categories: report.categories,
          rulesVersion: report.rulesVersion,
          overheadTokens: report.overheadTokens,
          findings: displayedFindings,
          suppressedCount: report.suppressed.length,
          skipped: report.skipped,
        }),
      );
    } else {
      const html = renderHtmlReport({
        toolVersion: report.toolVersion,
        rulesVersion: report.rulesVersion,
        theme: getTheme(themeFlag),
        score: report.score,
        band: report.band,
        capped: report.capped,
        categories: report.categories,
        overheadTokens: report.overheadTokens,
        findings: displayedFindings,
        highAndCriticalCount,
        suppressed: report.suppressed,
        skipped: report.skipped,
      });
      const result = await writeOutputFile(outDir, 'setup-doctor-report.html', html, yes);
      if (!result.ok) {
        io.err(`setup-doctor doctor: ${result.path} ${result.reason}`);
        return 2;
      }
      io.out(`Wrote ${result.path}`);
    }

    if (ci && failUnder !== undefined && report.score !== null && report.score < failUnder) {
      return 1;
    }
    return 0;
  } catch (err) {
    io.err(`setup-doctor doctor: internal error: ${(err as Error).message}\nPlease file an issue.`);
    return 4;
  }
}

async function runBadgeCommand(rest: string[], io: Io, homeDir?: string): Promise<number> {
  const { flags, positionals } = parseArgsAfterCommand(rest);
  const parsed = parseCommonFlags(flags, io);
  if (typeof parsed === 'number') return parsed;
  const { agentFlag, scopeFlag, themeFlag, outDir, yes } = parsed;
  const endpoint = flags.endpoint === true;

  try {
    const report = await runDoctor({
      path: positionals[0],
      agent: agentFlag as Agent | 'all',
      scope: scopeFlag as Scope | 'all',
      homeDir,
    });

    if (report.agentsDetected.length === 0) {
      io.out('Nothing to check. Use --agent to specify an agent or pass a path to a project.');
      return 0;
    }
    if (report.score === null || report.band === null) {
      io.out('Not enough to score. No badge produced.');
      return 0;
    }

    const svg = renderBadgeSvg({ score: report.score, band: report.band, theme: themeFlag });
    const svgResult = await writeOutputFile(outDir, 'setup-doctor-badge.svg', svg, yes);
    if (!svgResult.ok) {
      io.err(`setup-doctor badge: ${svgResult.path} ${svgResult.reason}`);
      return 2;
    }
    io.out(`Wrote ${svgResult.path}`);
    io.out(renderMarkdownSnippet(report.score, report.band));

    if (endpoint) {
      const endpointJson = JSON.stringify(renderEndpointBadgeJson(report.score, report.band));
      const jsonResult = await writeOutputFile(outDir, 'setup-doctor-badge.json', endpointJson, yes);
      if (!jsonResult.ok) {
        io.err(`setup-doctor badge: ${jsonResult.path} ${jsonResult.reason}`);
        return 2;
      }
      io.out(`Wrote ${jsonResult.path}`);
      io.out(
        'Publish this file to a public URL from your own CI, then use:\n' +
          `https://img.shields.io/endpoint?url=<encoded public URL of ${jsonResult.path}>`,
      );
    }

    return 0;
  } catch (err) {
    io.err(`setup-doctor badge: internal error: ${(err as Error).message}\nPlease file an issue.`);
    return 4;
  }
}

async function runRulesCommand(io: Io): Promise<number> {
  let config;
  try {
    const { raw } = await loadConfigFile(process.cwd());
    config = mergeConfig(raw, {});
  } catch (err) {
    if (err instanceof ConfigParseError) {
      io.err(err.message);
      return 2;
    }
    throw err;
  }
  const disabled = new Set(config.disabledRules.map((r) => r.toUpperCase()));
  const lines = ['ID       CATEGORY      SEVERITY        ENABLED'];
  for (const rule of ALL_RULES) {
    const enabled = disabled.has(rule.id.toUpperCase()) ? 'no' : 'yes';
    lines.push(`${rule.id.padEnd(8)} ${rule.category.padEnd(13)} ${rule.severityLabel.padEnd(15)} ${enabled}`);
  }
  io.out(lines.join('\n'));
  return 0;
}

async function runExplainCommand(rest: string[], io: Io): Promise<number> {
  const ruleId = rest[0];
  if (!ruleId) {
    io.err('Usage: setup-doctor explain <RULE_ID>');
    return 2;
  }
  const rule = getRule(ruleId);
  if (!rule) {
    io.err(`Unknown rule: ${ruleId}\nRun setup-doctor rules to list valid IDs.`);
    return 2;
  }
  io.out(
    [
      `${rule.id}  ${rule.title}`,
      `Category: ${rule.category}   Severity: ${rule.severityLabel}   Heuristic: ${rule.heuristic ? 'yes' : 'no'}`,
      '',
      'Why it matters:',
      `  ${rule.why}`,
      '',
      'Fix:',
      `  ${rule.fix}`,
    ].join('\n'),
  );
  return 0;
}

/**
 * Entry point used by src/bin.ts and by tests.
 * Returns the process exit code. Exit codes: 0 ok, 1 score below threshold (CI),
 * 2 usage error, 3 unreadable or unsupported data, 4 internal error.
 * `homeDirOverride` is test-only: it lets tests point discovery at a fixture
 * home directory instead of the real one.
 */
export async function main(argv: string[], io: Io = defaultIo, homeDirOverride?: string): Promise<number> {
  if (argv.includes('--version')) {
    io.out(VERSION);
    return 0;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    io.out(HELP);
    return 0;
  }

  const first = argv[0];
  if (first !== undefined && first.startsWith('-')) {
    io.err(`Unknown option: ${first}\nRun setup-doctor --help for usage.`);
    return 2;
  }

  let command: string;
  let rest: string[];
  if (first !== undefined && COMMANDS.has(first)) {
    command = first;
    rest = argv.slice(1);
  } else {
    command = 'doctor';
    rest = argv;
  }

  if (command === 'doctor') {
    return runDoctorCommand(rest, io, homeDirOverride);
  }
  if (command === 'badge') {
    return runBadgeCommand(rest, io, homeDirOverride);
  }
  if (command === 'rules') {
    return runRulesCommand(io);
  }
  if (command === 'explain') {
    return runExplainCommand(rest, io);
  }

  io.err(`setup-doctor ${command}: not implemented yet. See docs/scope.md.`);
  return 4;
}

// Exposed for tests and future rule/report wiring.
export { RULES_VERSION };
