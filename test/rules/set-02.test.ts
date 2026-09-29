import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copilotAdapter } from '../../src/adapters/copilot.js';
import { emptyModel } from '../../src/core/runner.js';
import { set02 } from '../../src/rules/set-02.js';
import type { DiscoveryContext } from '../../src/core/types.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SET-02 Hook points to a missing script', () => {
  it('triggers when the script does not exist', async () => {
    const model = await loadFixtureModel('set-02-trigger');
    const findings = set02.run({ model, config });
    expect(findings).toHaveLength(1);
    // The resolved path is OS-native (backslashes on Windows), so check the
    // parts that don't depend on the path separator.
    expect(findings[0]?.message).toContain('format.sh');
    expect(findings[0]?.message).toContain('which is missing or not executable');
  });

  it('marks it fixable, with a remove-hook fixHint, for the shared settings.json shape', async () => {
    const model = await loadFixtureModel('set-02-trigger');
    const findings = set02.run({ model, config });
    expect(findings[0]?.fixable).toBe(true);
    expect(findings[0]?.fixHint).toEqual({ kind: 'remove-hook', event: 'PreToolUse', command: './scripts/format.sh' });
  });

  it('does not trigger for a non-path command', async () => {
    const model = await loadFixtureModel('set-02-clean');
    expect(set02.run({ model, config })).toEqual([]);
  });

  it('marks a broken hook from Copilot\'s own native .github/hooks/*.json format as not fixable (different, unsupported JSON shape)', async () => {
    const ctx: DiscoveryContext = {
      projectRoot: join(__dirname, '..', 'fixtures', 'adapter-copilot', 'typical', 'project'),
      homeDir: join(__dirname, '..', 'fixtures', 'adapter-copilot', 'typical', 'nonexistent-home'),
      scope: 'all',
    };
    const settings = await copilotAdapter.readSettings(ctx);
    const model = emptyModel();
    for (const item of settings.items) {
      if ('event' in item) model.hooks.push(item);
    }
    const findings = set02.run({ model, config });
    const nativeHook = findings.find((f) => f.file === '.github/hooks/checks.json');
    expect(nativeHook).toBeDefined();
    expect(nativeHook?.fixable).toBe(false);
    expect(nativeHook?.fixHint).toBeUndefined();
  });
});
