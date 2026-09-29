import { describe, expect, it } from 'vitest';
import { ins02 } from '../../src/rules/ins-02.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-02 Instruction file too large', () => {
  it('triggers high for a file at or above the high-token limit', async () => {
    const model = await loadFixtureModel('ins-02-trigger');
    const findings = ins02.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.message).toMatch(/is about \d+ tokens \(limit 5000\)/);
  });

  it('does not trigger for a small file', async () => {
    const model = await loadFixtureModel('ins-02-clean');
    expect(ins02.run({ model, config })).toEqual([]);
  });
});
