import { describe, expect, it } from 'vitest';
import { ins07 } from '../../src/rules/ins-07.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-07 No build or test command documented', () => {
  it('triggers when a build manifest exists but no command is documented', async () => {
    const model = await loadFixtureModel('ins-07-trigger');
    const findings = ins07.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('No build or test command documented');
  });

  it('does not trigger when a test command is documented', async () => {
    const model = await loadFixtureModel('ins-07-clean');
    expect(ins07.run({ model, config })).toEqual([]);
  });
});
