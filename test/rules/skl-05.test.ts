import { describe, expect, it } from 'vitest';
import { skl05 } from '../../src/rules/skl-05.js';
import { config, loadFixtureModel } from './helpers.js';

describe('SKL-05 Broken links to bundled files', () => {
  it('triggers when a linked file does not exist', async () => {
    const model = await loadFixtureModel('skl-05-trigger');
    const findings = skl05.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('references/schema.md');
  });

  it('does not trigger when the linked file exists', async () => {
    const model = await loadFixtureModel('skl-05-clean');
    expect(skl05.run({ model, config })).toEqual([]);
  });
});
