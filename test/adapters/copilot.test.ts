import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copilotAdapter } from '../../src/adapters/copilot.js';
import type { DiscoveryContext } from '../../src/core/types.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'adapter-copilot');

function ctxFor(scenario: string): DiscoveryContext {
  return {
    projectRoot: join(FIXTURES, scenario, 'project'),
    homeDir: join(FIXTURES, scenario, 'nonexistent-home'),
    scope: 'all',
  };
}

describe('copilot adapter', () => {
  const ctx = ctxFor('typical');

  it('detects the setup from .github/copilot-instructions.md', async () => {
    expect(await copilotAdapter.detect(ctx)).toBe(true);
  });

  it('does not detect an unrelated empty project', async () => {
    const emptyCtx: DiscoveryContext = {
      projectRoot: join(FIXTURES, 'does-not-exist'),
      homeDir: join(FIXTURES, 'does-not-exist-home'),
      scope: 'all',
    };
    expect(await copilotAdapter.detect(emptyCtx)).toBe(false);
  });

  it('reads .github/copilot-instructions.md and .github/instructions/*.instructions.md', async () => {
    const result = await copilotAdapter.readInstructions(ctx);
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual(['.github/copilot-instructions.md', '.github/instructions/frontend.instructions.md']);
    expect(result.items.every((i) => i.agent === 'copilot' && i.scope === 'project')).toBe(true);
  });

  it('reads skills from .github/skills (its own) and .claude/skills (shared with Claude Code)', async () => {
    const result = await copilotAdapter.readSkills(ctx);
    const names = result.items.map((s) => s.name).sort();
    expect(names).toEqual(['reviewer', 'shared-skill']);
    expect(result.items.every((s) => s.agent === 'copilot')).toBe(true);
  });

  it('reads MCP servers from .vscode/mcp.json (servers key) and .mcp.json (mcpServers key)', async () => {
    const result = await copilotAdapter.readMcp(ctx);
    const names = result.items.map((s) => s.name).sort();
    expect(names).toEqual(['portable-server', 'vscode-server']);
    expect(result.items.every((s) => s.agent === 'copilot' && s.scope === 'project')).toBe(true);
  });

  it('reads hooks and permissions from .claude/settings.json (shared with Claude Code) and its own .github/hooks/*.json', async () => {
    const result = await copilotAdapter.readSettings(ctx);
    const hooks = result.items.filter((i) => 'event' in i);
    const permissions = result.items.filter((i) => 'kind' in i);
    // 1 from .claude/settings.json, 1 from .github/hooks/checks.json's
    // "command" entry (its "http" entry has no shell command to check, and
    // yields no HookDef).
    expect(hooks).toHaveLength(2);
    expect(permissions).toHaveLength(2);
    expect(result.items.every((i) => i.agent === 'copilot')).toBe(true);
  });

  it('reads its own native .github/hooks/*.json, skips http-type entries (no command), and script-checks command-type entries', async () => {
    const result = await copilotAdapter.readSettings(ctx);
    const hooks = result.items.filter((i): i is import('../../src/core/types.js').HookDef => 'event' in i);
    const nativeHook = hooks.find((h) => h.sourcePath === '.github/hooks/checks.json');
    expect(nativeHook).toBeDefined();
    expect(nativeHook?.event).toBe('preToolUse');
    expect(nativeHook?.command).toBe('./scripts/pre-check.sh');
    expect(nativeHook?.scriptCheck?.exists).toBe(false); // the fixture never creates this script
  });

  it('reads Copilot-native hooks from the global ~/.copilot/hooks/*.json too', async () => {
    const homeCtx: DiscoveryContext = {
      projectRoot: join(FIXTURES, 'typical', 'project'),
      homeDir: join(FIXTURES, 'typical', 'home-with-hooks'),
      scope: 'all',
    };
    const result = await copilotAdapter.readSettings(homeCtx);
    const hooks = result.items.filter((i): i is import('../../src/core/types.js').HookDef => 'event' in i);
    const globalHook = hooks.find((h) => h.scope === 'global');
    expect(globalHook).toBeDefined();
    expect(globalHook?.event).toBe('agentStop');
    expect(globalHook?.command).toBe('~/scripts/notify.sh');
  });

  it('has no plugin/marketplace concept', async () => {
    expect((await copilotAdapter.readPlugins(ctx)).items).toEqual([]);
  });

  it('readSessions yields nothing when the fixture home has no .copilot/session-state', async () => {
    const out = [];
    for await (const r of copilotAdapter.readSessions(ctx, { kind: 'all' })) out.push(r);
    expect(out).toEqual([]);
  });

  it('readSessions reads real session records end to end through the adapter', async () => {
    const wrappedCtx: DiscoveryContext = {
      projectRoot: join(FIXTURES, 'typical', 'project'),
      homeDir: join(__dirname, '..', 'fixtures', 'wrapped-copilot', 'home'),
      scope: 'all',
    };
    const out = [];
    for await (const r of copilotAdapter.readSessions(wrappedCtx, { kind: 'all' })) out.push(r);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.agent === 'copilot')).toBe(true);
  });

  it('does not auto-detect from shared-only signals alone (.mcp.json, .claude/skills, .claude/settings.json)', async () => {
    // A project using only the portable/shared conventions, with no
    // Copilot-unique file, should not make Copilot auto-detected: those
    // files alone are already sufficient evidence for Claude Code.
    const sharedOnlyCtx: DiscoveryContext = {
      projectRoot: join(FIXTURES, 'shared-only', 'project'),
      homeDir: join(FIXTURES, 'shared-only', 'nonexistent-home'),
      scope: 'all',
    };
    expect(await copilotAdapter.detect(sharedOnlyCtx)).toBe(false);
  });
});
