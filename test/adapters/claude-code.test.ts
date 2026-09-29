import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeCodeAdapter } from '../../src/adapters/claude-code.js';
import type { DiscoveryContext } from '../../src/core/types.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'adapter-claude');

function ctxFor(scenario: string, opts: { home?: string } = {}): DiscoveryContext {
  return {
    projectRoot: join(FIXTURES, scenario, 'project'),
    homeDir: opts.home ?? join(FIXTURES, scenario, 'home'),
    scope: 'all',
    ignore: [],
  };
}

const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('claude-code adapter: empty project', () => {
  it('detects nothing and reads nothing', async () => {
    const ctx: DiscoveryContext = {
      projectRoot: tempDir('setup-doctor-empty-project-'),
      homeDir: tempDir('setup-doctor-empty-home-'),
      scope: 'all',
      ignore: [],
    };
    expect(await claudeCodeAdapter.detect(ctx)).toBe(false);
    const instructions = await claudeCodeAdapter.readInstructions(ctx);
    expect(instructions.items).toEqual([]);
    expect(instructions.skipped).toEqual([]);
    const skills = await claudeCodeAdapter.readSkills(ctx);
    expect(skills.items).toEqual([]);
    const mcp = await claudeCodeAdapter.readMcp(ctx);
    expect(mcp.items).toEqual([]);
  });
});

describe('claude-code adapter: typical project', () => {
  const ctx = ctxFor('typical');

  it('detects the setup', async () => {
    expect(await claudeCodeAdapter.detect(ctx)).toBe(true);
  });

  it('reads global and project instruction files', async () => {
    const result = await claudeCodeAdapter.readInstructions(ctx);
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual(['CLAUDE.md', '~/.claude/CLAUDE.md']);
    const project = result.items.find((i) => i.path === 'CLAUDE.md');
    expect(project?.scope).toBe('project');
    expect(project?.estTokens).toBe(Math.ceil((project?.text.length ?? 0) / 4));
  });

  it('reads a project skill and a global skill, and a global subagent', async () => {
    const result = await claudeCodeAdapter.readSkills(ctx);
    const byName = new Map(result.items.map((s) => [s.name, s]));

    const beta = byName.get('beta');
    expect(beta?.kind).toBe('skill');
    expect(beta?.scope).toBe('project');
    expect(beta?.frontmatterValid).toBe(true);
    expect(beta?.relativeRefs).toEqual([{ target: 'reference.md', line: 6, exists: true }]);

    const alpha = byName.get('alpha');
    expect(alpha?.kind).toBe('skill');
    expect(alpha?.scope).toBe('global');

    const reviewer = byName.get('reviewer');
    expect(reviewer?.kind).toBe('agent');
    expect(reviewer?.scope).toBe('global');
    expect(reviewer?.frontmatterValid).toBe(true);
  });

  it('reads an MCP server and computes secret-like env keys without keeping the value', async () => {
    const result = await claudeCodeAdapter.readMcp(ctx);
    expect(result.items).toHaveLength(1);
    const server = result.items[0];
    expect(server?.name).toBe('linear');
    expect(server?.command).toBe('npx');
    expect(server?.secretLikeEnvKeys).toEqual(['LINEAR_API_KEY']);
    expect(JSON.stringify(server)).not.toContain('sk-ant-');
  });

  it('reads an installed, enabled plugin', async () => {
    const result = await claudeCodeAdapter.readPlugins(ctx);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: 'my-plugin', manifestValid: true, enabled: true });
  });

  it('reads hooks and permission rules from settings at both scopes', async () => {
    const result = await claudeCodeAdapter.readSettings(ctx);
    const hooks = result.items.filter((i) => 'event' in i);
    const permissions = result.items.filter((i) => 'kind' in i);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({ event: 'PreToolUse', command: 'npx prettier --check .' });
    expect(permissions.map((p) => (p as { rule: string }).rule).sort()).toEqual(['Bash(*)', 'Bash(npm test:*)']);
  });
});

describe('claude-code adapter: monorepo', () => {
  it('finds nested instruction files up to the depth limit', async () => {
    const ctx = ctxFor('monorepo', { home: tempDir('setup-doctor-monorepo-home-') });
    const result = await claudeCodeAdapter.readInstructions(ctx);
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual([
      'CLAUDE.md',
      'packages/pkg-a/CLAUDE.md',
      'packages/pkg-b/nested/CLAUDE.md',
    ]);
  });
});

describe('claude-code adapter: broken files', () => {
  it('reports invalid skill frontmatter without crashing', async () => {
    const ctx = ctxFor('broken', { home: tempDir('setup-doctor-broken-home-') });
    const result = await claudeCodeAdapter.readSkills(ctx);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ frontmatterValid: false, frontmatterError: 'no frontmatter' });
  });

  it('reports invalid MCP JSON as a warning, not an exception', async () => {
    const ctx = ctxFor('broken', { home: tempDir('setup-doctor-broken-home-') });
    const result = await claudeCodeAdapter.readMcp(ctx);
    expect(result.items).toEqual([]);
    expect(result.warnings.some((w) => w.includes('.mcp.json'))).toBe(true);
  });
});

describe('claude-code adapter: @import resolution', () => {
  it('splices an imported file into the instruction text', async () => {
    const ctx = ctxFor('imports', { home: tempDir('setup-doctor-imports-home-') });
    const result = await claudeCodeAdapter.readInstructions(ctx);
    const project = result.items.find((i) => i.path === 'CLAUDE.md');
    expect(project?.text).toContain('Shared rule: keep functions short.');
    expect(project?.estTokens).toBe(Math.ceil((project?.text.length ?? 0) / 4));
  });

  it('breaks an import cycle and records a warning instead of recursing forever', async () => {
    const ctx = ctxFor('imports-cycle', { home: tempDir('setup-doctor-cycle-home-') });
    const result = await claudeCodeAdapter.readInstructions(ctx);
    expect(result.warnings.some((w) => w.includes('cycle'))).toBe(true);
    const project = result.items.find((i) => i.path === 'CLAUDE.md');
    expect(project?.text).toContain('@CLAUDE.md');
  });
});

describe('claude-code adapter: oversized file', () => {
  it('skips a file over 10 MB with a reason', async () => {
    const projectRoot = tempDir('setup-doctor-oversized-project-');
    writeFileSync(join(projectRoot, 'CLAUDE.md'), 'x'.repeat(10 * 1024 * 1024 + 1));
    const ctx: DiscoveryContext = {
      projectRoot,
      homeDir: tempDir('setup-doctor-oversized-home-'),
      scope: 'all',
      ignore: [],
    };
    const result = await claudeCodeAdapter.readInstructions(ctx);
    expect(result.items).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('10 MB');
  });
});
