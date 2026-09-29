import { describe, expect, it } from 'vitest';
import { set03 } from '../../src/rules/set-03.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SET-03 Hook shells out to a network tool', () => {
  it('triggers on a hook that pipes to curl', async () => {
    const model = await loadFixtureModel('set-03-trigger');
    const findings = set03.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('curl');
  });

  it('does not trigger on a hook with no network tool', async () => {
    const model = await loadFixtureModel('set-03-clean');
    expect(set03.run({ model, config })).toEqual([]);
  });
});
