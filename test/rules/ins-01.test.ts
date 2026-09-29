import { describe, expect, it } from 'vitest';
import { ins01 } from '../../src/rules/ins-01.js';
import { config, loadFixtureModel } from './helpers.js';

describe('INS-01 Instruction file present', () => {
  it('triggers when no instruction file exists for a detected agent', async () => {
    const model = await loadFixtureModel('ins-01-trigger');
    const findings = ins01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('No instruction file found for claude');
  });

  it('does not trigger when a project CLAUDE.md exists', async () => {
    const model = await loadFixtureModel('ins-01-clean');
    expect(ins01.run({ model, config })).toEqual([]);
  });
});
