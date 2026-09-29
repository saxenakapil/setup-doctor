import { describe, expect, it } from 'vitest';
import { ins06 } from '../../src/rules/ins-06.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-06 Stale references', () => {
  it('triggers on a mentioned path that does not exist', async () => {
    const model = await loadFixtureModel('ins-06-trigger');
    const findings = ins06.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('src/legacy/handler.ts');
  });

  it('does not trigger when the mentioned path exists', async () => {
    const model = await loadFixtureModel('ins-06-clean');
    expect(ins06.run({ model, config })).toEqual([]);
  });
});
