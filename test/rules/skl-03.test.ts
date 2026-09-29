import { describe, expect, it } from 'vitest';
import { skl03 } from '../../src/rules/skl-03.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SKL-03 Overlapping skills', () => {
  it('triggers when two descriptions differ by one word', async () => {
    const model = await loadFixtureModel('skl-03-trigger');
    const findings = skl03.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('have overlapping descriptions');
  });

  it('does not trigger for skills on different topics', async () => {
    const model = await loadFixtureModel('skl-03-clean');
    expect(skl03.run({ model, config })).toEqual([]);
  });
});
