import { describe, expect, it } from 'vitest';
import { skl01 } from '../../src/rules/skl-01.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SKL-01 Invalid or missing frontmatter', () => {
  it('triggers when a SKILL.md has no frontmatter block', async () => {
    const model = await loadFixtureModel('skl-01-trigger');
    const findings = skl01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('no frontmatter');
  });

  it('does not trigger with a name and description present', async () => {
    const model = await loadFixtureModel('skl-01-clean');
    expect(skl01.run({ model, config })).toEqual([]);
  });
});
