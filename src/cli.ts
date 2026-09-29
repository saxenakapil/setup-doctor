import { VERSION } from './version.js';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text + '\n'),
  err: (text) => process.stderr.write(text + '\n'),
};

const COMMANDS = new Set(['doctor', 'wrapped', 'badge', 'rules', 'explain']);

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

Status: scaffold only. The commands are not implemented yet.
See docs/scope.md for the full plan.`;

/**
 * Entry point used by src/bin.ts and by tests.
 * Returns the process exit code. Exit codes: 0 ok, 1 score below threshold (CI),
 * 2 usage error, 3 unreadable or unsupported data, 4 internal error.
 */
export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
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

  const command = first ?? 'doctor';
  if (!COMMANDS.has(command)) {
    io.err(`Unknown command: ${command}\nRun setup-doctor --help for usage.`);
    return 2;
  }

  io.err(`setup-doctor ${command}: not implemented yet. See docs/scope.md.`);
  return 4;
}
