import { describe, expect, it } from 'vitest';
import { mcp05 } from '../../src/rules/mcp-05.js';
import { emptyModel } from '../../src/core/runner.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';
import type { McpServer, SessionRecord } from '../../src/core/types.js';

const NOW = '2026-09-29T12:00:00.000Z';

function server(name: string): McpServer {
  return {
    agent: 'claude',
    scope: 'project',
    sourcePath: '.mcp.json',
    name,
    command: 'npx',
    args: [],
    secretLikeEnvKeys: [],
    disabled: false,
  };
}

function record(daysAgo: number, tools: string[]): SessionRecord {
  const ts = new Date(new Date(NOW).getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { agent: 'claude', sessionId: 's1', project: 'p', ts, kind: 'assistant', tools };
}

describe('MCP-05 Server not used recently', () => {
  it('triggers when 20 days of logs show no use of the server', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], mcpServers: [server('linear')] };
    const sessions = [record(20, ['Read']), record(0, ['Bash'])];
    const findings = mcp05.run({ model, config: DEFAULT_CONFIG, sessions, now: NOW });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.possible).toBe(true);
    expect(findings[0]?.message).toContain('linear');
  });

  it('does not trigger when logs cover only 5 days', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], mcpServers: [server('linear')] };
    const sessions = [record(5, ['Read']), record(0, ['Bash'])];
    expect(mcp05.run({ model, config: DEFAULT_CONFIG, sessions, now: NOW })).toEqual([]);
  });

  it('does not trigger when the server was used in the window', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], mcpServers: [server('linear')] };
    const sessions = [record(20, ['mcp__linear__search']), record(0, ['Bash'])];
    expect(mcp05.run({ model, config: DEFAULT_CONFIG, sessions, now: NOW })).toEqual([]);
  });

  it('returns no findings with no sessions at all', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], mcpServers: [server('linear')] };
    expect(mcp05.run({ model, config: DEFAULT_CONFIG })).toEqual([]);
  });
});
