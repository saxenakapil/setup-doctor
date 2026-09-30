import { describe, expect, it } from 'vitest';
import { ins08 } from '../../src/rules/ins-08.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-08 Secret-like string in an instruction file', () => {
  it('triggers on a vendor-shaped secret assignment and never leaks the value', async () => {
    const model = await loadFixtureModel('ins-08-trigger');
    const findings = ins08.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[0]?.message).toContain('[REDACTED]');
    expect(JSON.stringify(findings)).not.toContain('sk-ant-EXAMPLEEXAMPLEEXAMPLEEXAMPLE');
  });

  it('does not trigger on a placeholder or an unrelated hash', async () => {
    const model = await loadFixtureModel('ins-08-clean');
    expect(ins08.run({ model, config })).toEqual([]);
  });
});
