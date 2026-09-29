import { describe, expect, it } from 'vitest';
import { frs02 } from '../../src/rules/frs-02.js';
import { config, loadFixtureModel } from './helpers.js';

describe('FRS-02 Retired model names', () => {
  it('triggers when a retired model is mentioned', async () => {
    const model = await loadFixtureModel('frs-02-trigger');
    const findings = frs02.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('claude-3-opus');
  });

  it('does not trigger when no model is named', async () => {
    const model = await loadFixtureModel('frs-02-clean');
    expect(frs02.run({ model, config })).toEqual([]);
  });
});
