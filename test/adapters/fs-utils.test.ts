import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findNestedFiles } from '../../src/adapters/fs-utils.js';

describe('findNestedFiles: SKIP_DIRS', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-findnested-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds a nested CLAUDE.md in an ordinary subdirectory', async () => {
    mkdirSync(join(dir, 'packages', 'a'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'a', 'CLAUDE.md'), 'x');
    const found = await findNestedFiles(dir, 'CLAUDE.md', 5);
    expect(found).toEqual([join(dir, 'packages', 'a', 'CLAUDE.md')]);
  });

  it('never descends into .setupdoctor-backup (regression: a backed-up CLAUDE.md must not re-enter discovery)', async () => {
    mkdirSync(join(dir, '.setupdoctor-backup', '2026-01-01', 'project'), { recursive: true });
    writeFileSync(join(dir, '.setupdoctor-backup', '2026-01-01', 'project', 'CLAUDE.md'), 'stale pre-fix copy');
    const found = await findNestedFiles(dir, 'CLAUDE.md', 5);
    expect(found).toEqual([]);
  });

  it('never descends into node_modules, .git, dist, build, .venv or vendor', async () => {
    for (const skipDir of ['node_modules', '.git', 'dist', 'build', '.venv', 'vendor']) {
      mkdirSync(join(dir, skipDir, 'nested'), { recursive: true });
      writeFileSync(join(dir, skipDir, 'nested', 'CLAUDE.md'), 'x');
    }
    const found = await findNestedFiles(dir, 'CLAUDE.md', 5);
    expect(found).toEqual([]);
  });
});
