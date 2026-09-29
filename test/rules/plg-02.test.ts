import { describe, expect, it } from 'vitest';
import { plg02 } from '../../src/rules/plg-02.js';
import { config, loadFixtureModel } from './helpers.js';

describe('PLG-02 Name collisions between plugins', () => {
  it('triggers when two plugins define the same skill name', async () => {
    const model = await loadFixtureModel('plg-02-trigger');
    const findings = plg02.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('Plugins plugin-a and plugin-b both define review');
  });

  it('does not trigger for distinct names', async () => {
    const model = await loadFixtureModel('plg-02-clean');
    expect(plg02.run({ model, config })).toEqual([]);
  });
});
