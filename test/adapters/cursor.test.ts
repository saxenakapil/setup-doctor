import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cursorAdapter } from '../../src/adapters/cursor.js';
import type { DiscoveryContext } from '../../src/core/types.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'adapter-cursor');

function ctxFor(scenario: string): DiscoveryContext {
  return {
    projectRoot: join(FIXTURES, scenario, 'project'),
    homeDir: join(FIXTURES, scenario, 'nonexistent-home'),
    scope: 'all',
  };
}

describe('cursor adapter', () => {
  const ctx = ctxFor('typical');

  it('detects the setup from .cursorrules / .cursor', async () => {
    expect(await cursorAdapter.detect(ctx)).toBe(true);
  });

  it('reads .cursorrules and .cursor/rules/*.mdc', async () => {
    const result = await cursorAdapter.readInstructions(ctx);
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual(['.cursor/rules/style.mdc', '.cursorrules']);
    expect(result.items.every((i) => i.agent === 'cursor' && i.scope === 'project')).toBe(true);
  });

  it('reads MCP servers from project .cursor/mcp.json', async () => {
    const result = await cursorAdapter.readMcp(ctx);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: 'linear', command: 'npx', scope: 'project' });
  });

  it('has no skills, plugins or settings concept', async () => {
    expect((await cursorAdapter.readSkills(ctx)).items).toEqual([]);
    expect((await cursorAdapter.readPlugins(ctx)).items).toEqual([]);
    expect((await cursorAdapter.readSettings(ctx)).items).toEqual([]);
  });

  it('readSessions always yields nothing (no verified local source)', async () => {
    const out = [];
    for await (const r of cursorAdapter.readSessions(ctx, { kind: 'all' })) out.push(r);
    expect(out).toEqual([]);
  });

  it('does not detect an unrelated empty project', async () => {
    const emptyCtx: DiscoveryContext = {
      projectRoot: join(FIXTURES, 'does-not-exist'),
      homeDir: join(FIXTURES, 'does-not-exist-home'),
      scope: 'all',
    };
    expect(await cursorAdapter.detect(emptyCtx)).toBe(false);
  });
});
