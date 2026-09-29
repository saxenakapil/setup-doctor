import type { Finding, Rule } from '../core/types.js';
import { hasCoverageDays, usedToolPrefixInWindow } from './session-util.js';

const MIN_COVERAGE_DAYS = 14;
const WINDOW_DAYS = 30;

export const mcp05: Rule = {
  id: 'MCP-05',
  category: 'mcp',
  title: 'Server not used recently',
  agents: ['claude'],
  heuristic: true,
  needsSessions: true,
  severityLabel: 'low',
  why: 'Unused servers still add tool definitions.',
  fix: 'Remove or disable the server if you no longer need it.',
  run(ctx) {
    const sessions = ctx.sessions ?? [];
    if (!hasCoverageDays(sessions, MIN_COVERAGE_DAYS)) return [];
    const now = ctx.now ?? new Date().toISOString();

    const findings: Finding[] = [];
    for (const server of ctx.model.mcpServers) {
      if (server.disabled) continue;
      const prefix = `mcp__${server.name}__`;
      if (usedToolPrefixInWindow(sessions, prefix, now, WINDOW_DAYS)) continue;
      findings.push({
        ruleId: 'MCP-05',
        category: 'mcp',
        severity: 'low',
        agent: server.agent,
        sharedWith: server.sharedWith?.filter((a) => mcp05.agents.includes(a)),
        message: `MCP server ${server.name} was not used in the last 30 days (possible)`,
        why: mcp05.why,
        fix: mcp05.fix,
        possible: true,
      });
    }
    return findings;
  },
};
