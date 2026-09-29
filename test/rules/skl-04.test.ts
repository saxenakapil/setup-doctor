import { describe, expect, it } from 'vitest';
import { skl04 } from '../../src/rules/skl-04.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SKL-04 Skill file too long', () => {
  it('triggers on a 700 line SKILL.md', async () => {
    const model = await loadFixtureModel('skl-04-trigger');
    const findings = skl04.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/has \d+ lines \(limit 500\)/);
  });

  it('does not trigger on a 120 line SKILL.md', async () => {
    const model = await loadFixtureModel('skl-04-clean');
    expect(skl04.run({ model, config })).toEqual([]);
  });
});
