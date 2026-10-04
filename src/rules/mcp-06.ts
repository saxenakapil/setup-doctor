import type { Finding, McpServer, Rule } from '../core/types.js';

const PACKAGE_LAUNCHERS = new Set(['npx', 'uvx', 'bunx', 'pipx']);
const EXACT_NPM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** The package spec a launcher runs: the first argument that is not a flag (and, for pipx, not the `run` subcommand). */
function packageSpec(command: string, args: string[]): string | undefined {
  const positional = args.filter((arg) => !arg.startsWith('-'));
  if (command === 'pipx') return positional[0] === 'run' ? positional[1] : positional[0];
  return positional[0];
}

/** True when the spec names an exact version. npm: `name@1.2.3` (scoped names use the last `@`). uvx/pipx: `name==1.2.3`. */
export function isExactVersionSpec(command: string, spec: string): boolean {
  if (command === 'uvx' || command === 'pipx') {
    const match = /==([^=\s]+)$/.exec(spec);
    return match !== null && match[1] !== undefined && /^\d+(?:\.\d+)*(?:[-.][0-9A-Za-z.]+)?$/.test(match[1]);
  }
  const at = spec.lastIndexOf('@');
  if (at <= 0) return false;
  return EXACT_NPM_VERSION.test(spec.slice(at + 1));
}

function isUnpinnedLauncher(server: McpServer): boolean {
  if (server.disabled || !server.command) return false;
  if (!PACKAGE_LAUNCHERS.has(server.command)) return false;
  const spec = packageSpec(server.command, server.args);
  if (spec === undefined) return false;
  return !isExactVersionSpec(server.command, spec);
}

export const mcp06: Rule = {
  id: 'MCP-06',
  category: 'mcp',
  title: 'MCP server launched without an exact package version',
  agents: ['claude', 'codex', 'cursor', 'copilot'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'A launcher without an exact version runs whatever the registry serves today, so the code can change after you reviewed it.',
  fix: 'Pin an exact version, for example npx <package>@1.2.3 or uvx <package>==1.2.3.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const server of ctx.model.mcpServers) {
      if (!isUnpinnedLauncher(server)) continue;
      findings.push({
        ruleId: 'MCP-06',
        category: 'mcp',
        severity: 'medium',
        agent: server.agent,
        sharedWith: server.sharedWith?.filter((a) => mcp06.agents.includes(a)),
        file: server.sourcePath,
        message: `MCP server ${server.name} launches ${packageSpec(server.command ?? '', server.args)} without an exact version`,
        why: mcp06.why,
        fix: mcp06.fix,
      });
    }
    return findings;
  },
};
