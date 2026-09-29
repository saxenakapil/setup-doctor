import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildModel, detectAgents, makeDiscoveryContext, runDoctor, runRules } from '../../src/core/runner.js';
import { emptyModel } from '../../src/core/runner.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';
import type { McpServer, SessionRecord, Skill } from '../../src/core/types.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'adapter-claude');

describe('runner', () => {
  it('detects claude and builds a normalized model from the typical fixture', async () => {
    const ctx = makeDiscoveryContext({
      path: join(FIXTURES, 'typical', 'project'),
      homeDir: join(FIXTURES, 'typical', 'home'),
    });
    const agents = await detectAgents(ctx, 'auto');
    expect(agents).toEqual(['claude']);

    const model = await buildModel(ctx, agents);
    expect(model.instructions.length).toBeGreaterThan(0);
    expect(model.skills.length).toBeGreaterThan(0);
    expect(model.mcpServers.length).toBe(1);
    expect(model.plugins.length).toBe(1);
    expect(model.hooks.length).toBe(1);
    expect(model.permissions.length).toBe(2);
  });

  it('runDoctor runs the full rule set end to end against the typical fixture', async () => {
    const report = await runDoctor({
      path: join(FIXTURES, 'typical', 'project'),
      homeDir: join(FIXTURES, 'typical', 'home'),
    });
    expect(report.agentsDetected).toEqual(['claude']);
    expect(report.toolVersion).toBeTruthy();
    expect(report.rulesVersion).toBe('1.1.0');
    // The fixture deliberately plants a hardcoded MCP secret and an
    // overly-broad global permission rule to exercise MCP-03 and SET-01.
    const ruleIds = report.findings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual(['MCP-03', 'SET-01']);
    expect(JSON.stringify(report.findings)).not.toContain('sk-ant-');
  });
});

describe('runRules with sessions: SKL-06 and MCP-05 activation', () => {
  function skill(name: string): Skill {
    return {
      agent: 'claude',
      scope: 'project',
      path: `.claude/skills/${name}/SKILL.md`,
      sizeBytes: 10,
      kind: 'skill',
      folder: `.claude/skills/${name}`,
      name,
      description: `Does ${name} things.`,
      frontmatterValid: true,
      lineCount: 5,
      text: '',
      relativeRefs: [],
    };
  }

  function mcpServer(name: string): McpServer {
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

  function recordDaysAgo(days: number, tools: string[]): SessionRecord {
    const ts = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return { agent: 'claude', sessionId: 's1', project: 'p', ts, kind: 'assistant', tools };
  }

  it('flags an unused skill and an unused MCP server once logs cover at least 14 days', () => {
    const model = {
      ...emptyModel(),
      agents: ['claude' as const],
      skills: [skill('demo')],
      mcpServers: [mcpServer('unused-server')],
    };
    const sessions = [recordDaysAgo(20, ['Read']), recordDaysAgo(0, ['Bash'])];
    const { kept } = runRules(model, DEFAULT_CONFIG, sessions);
    const sessionFindings = kept.filter((f) => f.ruleId === 'SKL-06' || f.ruleId === 'MCP-05');
    expect(sessionFindings.map((f) => f.ruleId).sort()).toEqual(['MCP-05', 'SKL-06']);
    expect(sessionFindings.every((f) => f.possible)).toBe(true);
  });

  it('stays silent when logs cover fewer than 14 days', () => {
    const model = {
      ...emptyModel(),
      agents: ['claude' as const],
      skills: [skill('demo')],
      mcpServers: [mcpServer('unused-server')],
    };
    const sessions = [recordDaysAgo(5, ['Read']), recordDaysAgo(0, ['Bash'])];
    const { kept } = runRules(model, DEFAULT_CONFIG, sessions);
    expect(kept.filter((f) => f.ruleId === 'SKL-06' || f.ruleId === 'MCP-05')).toEqual([]);
  });

  it('does not flag a skill or server that was actually used in the window', () => {
    const model = {
      ...emptyModel(),
      agents: ['claude' as const],
      skills: [skill('demo')],
      mcpServers: [mcpServer('linear')],
    };
    const sessions = [recordDaysAgo(20, ['demo', 'mcp__linear__search']), recordDaysAgo(0, ['Bash'])];
    const { kept } = runRules(model, DEFAULT_CONFIG, sessions);
    expect(kept.filter((f) => f.ruleId === 'SKL-06' || f.ruleId === 'MCP-05')).toEqual([]);
  });

  it('runDoctor wires real session logs into rules end to end (SKL-06 activation)', async () => {
    const HOME = join(__dirname, '..', 'fixtures', 'wrapped', 'home');
    const PROJECT = join(FIXTURES, 'typical', 'project');
    // The wrapped fixture's sessions never mention the "beta" skill defined
    // in the typical project fixture, and span 2026-01-01 to 2026-01-02 --
    // only 1 day of coverage, so SKL-06 must stay silent (needs >= 14 days).
    // This mainly proves the plumbing (runDoctor -> adapter.readSessions ->
    // rules) works without throwing; the 14-day gate is covered precisely
    // by the unit-style tests above.
    const report = await runDoctor({ path: PROJECT, homeDir: HOME });
    expect(report.agentsDetected).toEqual(['claude']);
  });
});
