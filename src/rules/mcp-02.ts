import type { Agent, Finding, McpServer, Rule } from '../core/types.js';

function signature(s: McpServer): string {
  return s.url ? `url:${s.url}` : `cmd:${s.command ?? ''} ${s.args.join(' ')}`;
}

export const mcp02: Rule = {
  id: 'MCP-02',
  category: 'mcp',
  title: 'Duplicate servers',
  agents: ['claude', 'codex', 'cursor', 'copilot'],
  heuristic: false,
  fixable: true,
  severityLabel: 'medium',
  why: 'Duplicates load twice and double the tool definitions.',
  fix: 'Keep one definition and delete the duplicates.',
  run(ctx) {
    const findings: Finding[] = [];
    const byAgent = new Map<Agent, McpServer[]>();
    for (const s of ctx.model.mcpServers) {
      const list = byAgent.get(s.agent) ?? [];
      list.push(s);
      byAgent.set(s.agent, list);
    }

    for (const [agent, servers] of byAgent) {
      const byName = new Map<string, McpServer[]>();
      for (const s of servers) {
        const list = byName.get(s.name) ?? [];
        list.push(s);
        byName.set(s.name, list);
      }
      for (const [name, list] of byName) {
        const files = [...new Set(list.map((s) => s.sourcePath))].sort();
        if (files.length > 1) {
          findings.push({
            ruleId: 'MCP-02',
            category: 'mcp',
            severity: 'medium',
            agent,
            sharedWith: list[0]?.sharedWith?.filter((sw) => mcp02.agents.includes(sw)),
            file: files[0],
            message: `MCP server ${name} is defined more than once (${files[0]}, ${files[1]})`,
            why: mcp02.why,
            fix: mcp02.fix,
            fixable: false, // our model can't represent a same-file duplicate key
          });
        }
      }

      for (let i = 0; i < servers.length; i++) {
        for (let j = i + 1; j < servers.length; j++) {
          const a = servers[i] as McpServer;
          const b = servers[j] as McpServer;
          if (a.name === b.name) continue;
          if (signature(a) === signature(b)) {
            findings.push({
              ruleId: 'MCP-02',
              category: 'mcp',
              severity: 'medium',
              agent,
              sharedWith: a.sharedWith?.filter((sw) => mcp02.agents.includes(sw)),
              file: a.sourcePath,
              message: `Servers ${a.name} and ${b.name} run the same command`,
              why: mcp02.why,
              fix: mcp02.fix,
              fixable: false,
            });
          }
        }
      }
    }

    return findings;
  },
};
