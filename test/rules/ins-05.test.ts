import { describe, expect, it } from 'vitest';
import { ins05 } from '../../src/rules/ins-05.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-05 Vague rules', () => {
  it('triggers on a bare vague-rule phrase', async () => {
    const model = await loadFixtureModel('ins-05-trigger');
    const findings = ins05.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('vague rules in');
  });

  it('does not trigger when the phrase is made specific', async () => {
    const model = await loadFixtureModel('ins-05-clean');
    expect(ins05.run({ model, config })).toEqual([]);
  });
});
