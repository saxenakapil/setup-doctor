import { describe, expect, it } from 'vitest';
import { set05 } from '../../src/rules/set-05.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SET-05 Hook command references a secret-like environment variable', () => {
  it('triggers on a hook that references $GITHUB_TOKEN', async () => {
    const model = await loadFixtureModel('set-05-trigger');
    const findings = set05.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('$GITHUB_TOKEN');
    expect(findings[0]?.possible).toBe(true);
  });

  it('does not trigger on a hook referencing a non-secret-like variable', async () => {
    const model = await loadFixtureModel('set-05-clean');
    expect(set05.run({ model, config })).toEqual([]);
  });
});
