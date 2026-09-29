import type { Finding, Rule } from '../core/types.js';

export const mcp01: Rule = {
  id: 'MCP-01',
  category: 'mcp',
  title: 'Config problem or command not found',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  severityLabel: 'high',
  why: 'A broken server fails silently or slows startup.',
  fix: 'Fix the config syntax, install the command, or remove the server entry.',
  run(ctx) {
    const findings: Finding[] = [];

    for (const err of ctx.model.mcpConfigErrors) {
      findings.push({
        ruleId: 'MCP-01',
        category: 'mcp',
        severity: 'high',
        agent: err.agent,
        file: err.sourcePath,
        message: `${err.sourcePath}: ${err.message}`,
        why: mcp01.why,
        fix: mcp01.fix,
      });
    }

    for (const server of ctx.model.mcpServers) {
      if (server.disabled) continue;
      if (server.commandFound === false) {
        findings.push({
          ruleId: 'MCP-01',
          category: 'mcp',
          severity: 'high',
          agent: server.agent,
          file: server.sourcePath,
          message: `MCP server ${server.name} uses command ${server.command} which was not found on PATH`,
          why: mcp01.why,
          fix: mcp01.fix,
        });
      }
    }

    return findings;
  },
};
