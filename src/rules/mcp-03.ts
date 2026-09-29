import type { Finding, Rule } from '../core/types.js';

export const mcp03: Rule = {
  id: 'MCP-03',
  category: 'mcp',
  title: 'Hardcoded secret in server environment',
  agents: ['claude', 'codex', 'cursor', 'copilot'],
  heuristic: false,
  severityLabel: 'critical',
  why: 'Config files are often committed or synced; a leaked token gives access to the connected service.',
  fix: 'Move the value to an environment variable and reference it, then rotate the credential.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const server of ctx.model.mcpServers) {
      for (const key of server.secretLikeEnvKeys) {
        findings.push({
          ruleId: 'MCP-03',
          category: 'mcp',
          severity: 'critical',
          agent: server.agent,
          sharedWith: server.sharedWith?.filter((a) => mcp03.agents.includes(a)),
          file: server.sourcePath,
          message: `MCP server ${server.name} has a hardcoded secret in env ${key} ([REDACTED])`,
          why: mcp03.why,
          fix: mcp03.fix,
        });
      }
    }
    return findings;
  },
};
