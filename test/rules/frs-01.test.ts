import { describe, expect, it } from 'vitest';
import { frs01 } from '../../src/rules/frs-01.js';
import { config, loadFixtureModel } from './helpers.js';

describe('FRS-01 Hard-pinned versions in instructions', () => {
  it('triggers on pinned versions', async () => {
    const model = await loadFixtureModel('frs-01-trigger');
    const findings = frs01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('hard-pinned versions');
  });

  it('does not trigger without a version number', async () => {
    const model = await loadFixtureModel('frs-01-clean');
    expect(frs01.run({ model, config })).toEqual([]);
  });
});
