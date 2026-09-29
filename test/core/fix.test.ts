import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyFixes, backupFiles, isProjectDirty, planFixes } from '../../src/core/fix.js';
import { buildModel, detectAgents, makeDiscoveryContext, runRules } from '../../src/core/runner.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';

const CLEAN_FIXTURE = join(__dirname, '..', 'fixtures', 'fix-mode', 'project-clean');
const NO_HOME = join(__dirname, '..', 'fixtures', '__no_home__');

describe('isProjectDirty', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-dirty-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is false when there is no .git', async () => {
    expect(await isProjectDirty(dir)).toBe(false);
  });

  it('is true whenever a .git path exists, file or directory (the tool never runs git)', async () => {
    writeFileSync(join(dir, '.git'), 'not a real repo, just a marker');
    expect(await isProjectDirty(dir)).toBe(true);
  });
});

describe('planFixes: INS-03 same-file exact duplicate (the only reachable safe fix)', () => {
  async function loadCleanFixture() {
    const ctx = makeDiscoveryContext({ path: CLEAN_FIXTURE, homeDir: NO_HOME });
    const agents = await detectAgents(ctx, 'auto');
    const model = await buildModel(ctx, agents);
    const { kept } = runRules(model, DEFAULT_CONFIG);
    return { ctx, model, findings: kept };
  }

  it('produces a plan that removes the second occurrence and keeps the first', async () => {
    const { ctx, model, findings } = await loadCleanFixture();
    const { plans, skipped } = await planFixes(model, findings, { ctx, scopeFlag: 'all', allowDirty: false });

    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan.ruleId).toBe('INS-03');
    expect(plan.displayPath).toBe('CLAUDE.md');
    expect(plan.after).toBe('Always run the tests before committing.\nUse 2 space indentation.\n');
    expect(plan.diff).toContain('-Always run the tests before committing.');
    expect(skipped.every((s) => s.finding.ruleId !== 'INS-03')).toBe(true);
  });

  it('refuses a project-scope file when a .git marker is present and --allow-dirty is not given', async () => {
    const dirtyDir = mkdtempSync(join(tmpdir(), 'setup-doctor-fix-dirty-'));
    try {
      writeFileSync(join(dirtyDir, 'CLAUDE.md'), readFileSync(join(CLEAN_FIXTURE, 'CLAUDE.md'), 'utf8'));
      writeFileSync(join(dirtyDir, '.git'), 'marker');
      const ctx = makeDiscoveryContext({ path: dirtyDir, homeDir: NO_HOME });
      const agents = await detectAgents(ctx, 'auto');
      const model = await buildModel(ctx, agents);
      const { kept } = runRules(model, DEFAULT_CONFIG);

      const refused = await planFixes(model, kept, { ctx, scopeFlag: 'all', allowDirty: false });
      expect(refused.plans).toEqual([]);
      expect(refused.skipped.some((s) => s.reason.includes('--allow-dirty'))).toBe(true);

      const allowed = await planFixes(model, kept, { ctx, scopeFlag: 'all', allowDirty: true });
      expect(allowed.plans).toHaveLength(1);
    } finally {
      rmSync(dirtyDir, { recursive: true, force: true });
    }
  });

  it('never plans a fix for a finding marked possible, even if it were fixable', async () => {
    const { ctx, model, findings } = await loadCleanFixture();
    const withPossible = [...findings, { ...findings[0]!, ruleId: 'INS-03', possible: true, fixable: true }];
    const { plans } = await planFixes(model, withPossible, { ctx, scopeFlag: 'all', allowDirty: false });
    // Only the one genuine (non-possible) fixable finding should plan; the
    // synthetic possible:true one must be skipped regardless of fixable.
    expect(plans).toHaveLength(1);
  });
});

describe('backupFiles and applyFixes', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'setup-doctor-apply-'));
    writeFileSync(join(workDir, 'CLAUDE.md'), readFileSync(join(CLEAN_FIXTURE, 'CLAUDE.md'), 'utf8'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('dry run: planning never writes to disk', async () => {
    const ctx = makeDiscoveryContext({ path: workDir, homeDir: NO_HOME });
    const agents = await detectAgents(ctx, 'auto');
    const model = await buildModel(ctx, agents);
    const { kept } = runRules(model, DEFAULT_CONFIG);
    await planFixes(model, kept, { ctx, scopeFlag: 'all', allowDirty: false });

    expect(readFileSync(join(workDir, 'CLAUDE.md'), 'utf8')).toBe(readFileSync(join(CLEAN_FIXTURE, 'CLAUDE.md'), 'utf8'));
  });

  it('backs up the original content before applying, then writes the fixed content', async () => {
    const ctx = makeDiscoveryContext({ path: workDir, homeDir: NO_HOME });
    const agents = await detectAgents(ctx, 'auto');
    const model = await buildModel(ctx, agents);
    const { kept } = runRules(model, DEFAULT_CONFIG);
    const { plans } = await planFixes(model, kept, { ctx, scopeFlag: 'all', allowDirty: false });

    const backupPath = await backupFiles(plans, workDir, new Date('2026-01-01T00:00:00.000Z'));
    expect(backupPath).not.toBeNull();
    const backedUp = readFileSync(join(backupPath as string, 'project', 'CLAUDE.md'), 'utf8');
    expect(backedUp).toBe(readFileSync(join(CLEAN_FIXTURE, 'CLAUDE.md'), 'utf8'));

    await applyFixes(plans);
    const written = readFileSync(join(workDir, 'CLAUDE.md'), 'utf8');
    expect(written).toBe('Always run the tests before committing.\nUse 2 space indentation.\n');
    expect(written).not.toBe(backedUp);
  });

  it('backupFiles returns null and writes nothing when there is nothing to fix', async () => {
    const backupPath = await backupFiles([], workDir, new Date());
    expect(backupPath).toBeNull();
  });
});

describe('planFixes: CRLF-checked-out files (regression)', () => {
  // A file with Windows line endings (as git on Windows checks fixtures out
  // by default, before .gitattributes forced LF) must not break line
  // numbering or leave stray \r characters in the fixed content. This does
  // not depend on the local git checkout's actual line endings -- it writes
  // CRLF directly, so it catches the bug on every platform, not just CI's
  // Windows runners.
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-crlf-'));
    writeFileSync(join(dir, 'CLAUDE.md'), 'Always run the tests before committing.\r\nUse 2 space indentation.\r\nAlways run the tests before committing.\r\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('produces the correct fixed content with no stray \\r characters', async () => {
    const ctx = makeDiscoveryContext({ path: dir, homeDir: NO_HOME });
    const agents = await detectAgents(ctx, 'auto');
    const model = await buildModel(ctx, agents);
    const { kept } = runRules(model, DEFAULT_CONFIG);

    const { plans } = await planFixes(model, kept, { ctx, scopeFlag: 'all', allowDirty: false });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.after).toBe('Always run the tests before committing.\nUse 2 space indentation.\n');
    expect(plans[0]?.after).not.toContain('\r');
  });
});
