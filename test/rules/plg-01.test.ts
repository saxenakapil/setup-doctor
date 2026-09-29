import { describe, expect, it } from 'vitest';
import { plg01 } from '../../src/rules/plg-01.js';
import { config, loadFixtureModel } from './helpers.js';

describe('PLG-01 Invalid plugin manifest', () => {
  it('triggers when a plugin folder has no manifest', async () => {
    const model = await loadFixtureModel('plg-01-trigger');
    const findings = plg01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('Plugin bad-plugin: manifest missing');
  });

  it('does not trigger for a valid manifest', async () => {
    const model = await loadFixtureModel('plg-01-clean');
    expect(plg01.run({ model, config })).toEqual([]);
  });
});
