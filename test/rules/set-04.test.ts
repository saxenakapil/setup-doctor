import { describe, expect, it } from 'vitest';
import { set04 } from '../../src/rules/set-04.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SET-04 Overly broad deny rule blocks legitimate work', () => {
  it('triggers on Bash(*) as a deny rule', async () => {
    const model = await loadFixtureModel('set-04-trigger');
    const findings = set04.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('Bash(*)');
  });

  it('does not trigger on a narrow deny rule targeting a specific risky command', async () => {
    const model = await loadFixtureModel('set-04-clean');
    expect(set04.run({ model, config })).toEqual([]);
  });
});
