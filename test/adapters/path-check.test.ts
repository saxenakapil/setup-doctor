import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCommandOnPath } from '../../src/adapters/path-check.js';

// isCommandOnPath uses node:path's join internally, which is OS-dependent
// (backslashes on Windows). Build expected paths the same way so these
// tests are deterministic on every CI runner, not just posix ones.
describe('isCommandOnPath', () => {
  it('finds a command in one of the injected PATH directories', async () => {
    const found = await isCommandOnPath('npx', {
      pathEnv: `${join('/usr/local/bin')}:${join('/usr/bin')}`,
      delimiter: ':',
      fileExists: async (p) => p === join('/usr/bin', 'npx'),
    });
    expect(found).toBe(true);
  });

  it('returns false when the command is nowhere on PATH', async () => {
    const found = await isCommandOnPath('not-a-real-binary', {
      pathEnv: `${join('/usr/local/bin')}:${join('/usr/bin')}`,
      delimiter: ':',
      fileExists: async () => false,
    });
    expect(found).toBe(false);
  });

  it('tries PATHEXT suffixes (using node:path join, so this stays OS-agnostic via forward slashes)', async () => {
    const { join } = await import('node:path');
    const found = await isCommandOnPath('npx', {
      pathEnv: '/tools',
      delimiter: ';',
      pathExt: '.EXE;.CMD',
      fileExists: async (p) => p === join('/tools', 'npx.CMD'),
    });
    expect(found).toBe(true);
  });
});
