import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codexAdapter } from '../../src/adapters/codex.js';
import type { DiscoveryContext } from '../../src/core/types.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'adapter-codex');

function ctxFor(scenario: string): DiscoveryContext {
  return {
    projectRoot: join(FIXTURES, scenario, 'project'),
    homeDir: join(FIXTURES, scenario, 'home'),
    scope: 'all',
    ignore: [],
  };
}

describe('codex adapter', () => {
  const ctx = ctxFor('typical');

  it('detects the setup from ~/.codex', async () => {
    expect(await codexAdapter.detect(ctx)).toBe(true);
  });

  it('reads global and project AGENTS.md files', async () => {
    const result = await codexAdapter.readInstructions(ctx);
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual(['AGENTS.md', '~/.codex/AGENTS.md']);
    expect(result.items.every((i) => i.agent === 'codex')).toBe(true);
  });

  it('computes stale references the same way as Claude (INS-06 applies to all agents)', async () => {
    const result = await codexAdapter.readInstructions(ctx);
    const project = result.items.find((i) => i.path === 'AGENTS.md');
    expect(project?.staleReferences).toEqual([{ target: 'src/legacy/handler.ts', line: 4, kind: 'path', exists: false }]);
  });

  it('reads MCP servers from config.toml, including a nested env table', async () => {
    const result = await codexAdapter.readMcp(ctx);
    const names = result.items.map((s) => s.name).sort();
    expect(names).toEqual(['leaky', 'node_repl']);
    const nodeRepl = result.items.find((s) => s.name === 'node_repl');
    expect(nodeRepl?.command).toBe('npx');
    expect(nodeRepl?.args).toEqual(['-y', 'node-repl-mcp']);
  });

  it('detects a hardcoded secret in a TOML env table without keeping the value', async () => {
    const result = await codexAdapter.readMcp(ctx);
    const leaky = result.items.find((s) => s.name === 'leaky');
    expect(leaky?.secretLikeEnvKeys).toEqual(['API_TOKEN']);
    expect(JSON.stringify(result.items)).not.toContain('sk-ant-');
  });

  it('has no skills, plugins or settings concept', async () => {
    expect((await codexAdapter.readSkills(ctx)).items).toEqual([]);
    expect((await codexAdapter.readPlugins(ctx)).items).toEqual([]);
    expect((await codexAdapter.readSettings(ctx)).items).toEqual([]);
  });

  it('readSessions yields nothing when ~/.codex/sessions does not exist', async () => {
    const out = [];
    for await (const r of codexAdapter.readSessions(ctx, { kind: 'all' })) out.push(r);
    expect(out).toEqual([]);
  });

  it('readSessions parses real rollout files when ~/.codex/sessions does exist', async () => {
    const wrappedHome = join(__dirname, '..', 'fixtures', 'wrapped-codex', 'home');
    const wrappedCtx: DiscoveryContext = { projectRoot: ctx.projectRoot, homeDir: wrappedHome, scope: 'all', ignore: [] };
    const out = [];
    for await (const r of codexAdapter.readSessions(wrappedCtx, { kind: 'all' })) out.push(r);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.agent === 'codex')).toBe(true);
  });
});
