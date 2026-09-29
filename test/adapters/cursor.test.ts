import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorAdapter } from '../../src/adapters/cursor.js';
import { buildCursorFixture, sqliteAvailable } from '../wrapped/cursor-fixture-helper.js';
import type { DiscoveryContext } from '../../src/core/types.js';

const HAS_SQLITE = await sqliteAvailable();

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

  it('readSessions yields nothing when the fixture home has no Cursor database', async () => {
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

describe.skipIf(!HAS_SQLITE)('cursor adapter readSessions against a real built database', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'setup-doctor-cursor-adapter-home-'));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('reads real session records end to end through the adapter', async () => {
    await buildCursorFixture(homeDir, [
      {
        composerId: 'c1',
        createdAt: Date.parse('2026-01-01T00:00:00Z'),
        lastUpdatedAt: Date.parse('2026-01-01T00:10:00Z'),
        modelName: 'gpt-5',
        bubbles: [
          { bubbleId: 'b1', type: 1 },
          { bubbleId: 'b2', type: 2, inputTokens: 40, outputTokens: 10, toolName: 'edit_file' },
        ],
      },
    ]);
    const ctx: DiscoveryContext = { projectRoot: '/nonexistent', homeDir, scope: 'all' };
    const out = [];
    for await (const r of cursorAdapter.readSessions(ctx, { kind: 'all' })) out.push(r);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.agent === 'cursor')).toBe(true);
    const assistant = out.find((r) => r.kind === 'assistant')!;
    expect(assistant.usage).toEqual({ input: 40, output: 10, cacheRead: 0, cacheWrite: 0 });
    expect(assistant.tools).toEqual(['edit_file']);
  });
});
