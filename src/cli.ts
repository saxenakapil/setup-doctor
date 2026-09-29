import { ConfigParseError, loadConfigFile, mergeConfig } from './core/config.js';
import { runDoctor } from './core/runner.js';
import type { Agent, Scope } from './core/types.js';
import { ALL_RULES, getRule } from './rules/index.js';
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
  --format     terminal | json | html (doctor: only json is implemented so far)
  --agent      claude | codex | cursor | all
  --scope      project | global | all

Status: doctor runs discovery and the instruction/skill rules, and prints
--format json. Scoring, the terminal/html report, wrapped and badge are
still in progress. See docs/scope.md for the full plan.`;

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

async function runDoctorCommand(rest: string[], io: Io, homeDir?: string): Promise<number> {
  const { flags, positionals } = parseArgsAfterCommand(rest);

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

    if (format === 'json') {
      io.out(
        JSON.stringify(
          {
            schemaVersion: 1,
            toolVersion: report.toolVersion,
            rulesVersion: report.rulesVersion,
            agentsDetected: report.agentsDetected,
            score: null,
            findings: report.findings,
            suppressed: report.suppressed,
            skipped: report.skipped,
            warnings: report.warnings,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    io.err('setup-doctor doctor: terminal and html report rendering are not implemented yet. Use --format json.');
    return 4;
  } catch (err) {
    io.err(`setup-doctor doctor: internal error: ${(err as Error).message}\nPlease file an issue.`);
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
