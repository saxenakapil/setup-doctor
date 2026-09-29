import { describe, expect, it } from 'vitest';
import { ins04 } from '../../src/rules/ins-04.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-04 Possible contradictions', () => {
  it('triggers on directly conflicting rules', async () => {
    const model = await loadFixtureModel('ins-04-trigger');
    const findings = ins04.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.possible).toBe(true);
    expect(findings[0]?.message).toContain('Possible contradiction between');
  });

  it('does not trigger on unrelated positive and negative rules', async () => {
    const model = await loadFixtureModel('ins-04-clean');
    expect(ins04.run({ model, config })).toEqual([]);
  });
});
