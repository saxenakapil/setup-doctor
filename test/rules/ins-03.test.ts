import { describe, expect, it } from 'vitest';
import { ins03 } from '../../src/rules/ins-03.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-03 Duplicate rules', () => {
  it('triggers on an exact duplicate line across two files', async () => {
    const model = await loadFixtureModel('ins-03-trigger');
    const findings = ins03.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('rules repeat between');
    expect(findings[0]?.fixable).toBe(false); // spans two files, not the same-file safe set
  });

  it('does not trigger for two files with different rules', async () => {
    const model = await loadFixtureModel('ins-03-clean');
    expect(ins03.run({ model, config })).toEqual([]);
  });
});
