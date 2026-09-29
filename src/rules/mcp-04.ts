import { RULE_DEFAULTS } from '../core/defaults.js';
import type { Agent, Finding, Rule } from '../core/types.js';

export const mcp04: Rule = {
  id: 'MCP-04',
  category: 'mcp',
  title: 'Many servers configured',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  severityLabel: 'low',
  why: 'Each server adds tool definitions to the context of every session.',
  fix: 'Disable servers you do not use in this project.',
  run(ctx) {
    const { maxServers } = { ...RULE_DEFAULTS['MCP-04'], ...(ctx.config.thresholds['MCP-04'] ?? {}) };
    const findings: Finding[] = [];

    const byAgent = new Map<Agent, Set<string>>();
    for (const s of ctx.model.mcpServers) {
      if (s.disabled) continue;
      const names = byAgent.get(s.agent) ?? new Set<string>();
      names.add(s.name);
      byAgent.set(s.agent, names);
    }

    for (const [agent, names] of byAgent) {
      if (names.size <= maxServers) continue;
      findings.push({
        ruleId: 'MCP-04',
        category: 'mcp',
        severity: 'low',
        agent,
        message: `${names.size} MCP servers configured for ${agent} (limit ${maxServers})`,
        why: mcp04.why,
        fix: mcp04.fix,
      });
    }

    return findings;
  },
};
