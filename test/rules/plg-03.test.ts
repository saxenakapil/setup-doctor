import { describe, expect, it } from 'vitest';
import { plg03 } from '../../src/rules/plg-03.js';
import { config, loadFixtureModel } from './helpers.js';

describe('PLG-03 Plugin installed but disabled', () => {
  it('triggers when the plugin is present but disabled in settings', async () => {
    const model = await loadFixtureModel('plg-03-trigger');
    const findings = plg03.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('Plugin my-plugin is installed but disabled');
  });

  it('does not trigger for an enabled plugin', async () => {
    const model = await loadFixtureModel('plg-03-clean');
    expect(plg03.run({ model, config })).toEqual([]);
  });
});
