import { describe, expect, it } from 'vitest';
import { skl02 } from '../../src/rules/skl-02.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SKL-02 Description too short or too long', () => {
  it('triggers on a too-short description', async () => {
    const model = await loadFixtureModel('skl-02-trigger');
    const findings = skl02.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('too short');
  });

  it('does not trigger on a description within range', async () => {
    const model = await loadFixtureModel('skl-02-clean');
    expect(skl02.run({ model, config })).toEqual([]);
  });
});
