import { describe, expect, it } from 'vitest';
import { set02 } from '../../src/rules/set-02.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SET-02 Hook points to a missing script', () => {
  it('triggers when the script does not exist', async () => {
    const model = await loadFixtureModel('set-02-trigger');
    const findings = set02.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('scripts/format.sh');
  });

  it('does not trigger for a non-path command', async () => {
    const model = await loadFixtureModel('set-02-clean');
    expect(set02.run({ model, config })).toEqual([]);
  });
});
