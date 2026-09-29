import { describe, expect, it } from 'vitest';
import { mcp03 } from '../../src/rules/mcp-03.js';
import { config, loadFixtureModel } from './helpers.js';

describe('MCP-03 Hardcoded secret in server environment', () => {
  it('triggers on a literal token value and never leaks it', async () => {
    const model = await loadFixtureModel('mcp-03-trigger');
    const findings = mcp03.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('GITHUB_TOKEN');
    expect(JSON.stringify(findings)).not.toContain('ghp_1234567890');
  });

  it('does not trigger when the value references an environment variable', async () => {
    const model = await loadFixtureModel('mcp-03-clean');
    expect(mcp03.run({ model, config })).toEqual([]);
  });
});
