import { describe, expect, it } from 'vitest';
import { set01 } from '../../src/rules/set-01.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SET-01 Overly broad permission rule', () => {
  it('triggers on Bash(*)', async () => {
    const model = await loadFixtureModel('set-01-trigger');
    const findings = set01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('Bash(*)');
  });

  it('does not trigger on a narrow rule', async () => {
    const model = await loadFixtureModel('set-01-clean');
    expect(set01.run({ model, config })).toEqual([]);
  });
});
