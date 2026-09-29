import { describe, expect, it } from 'vitest';
import { mcp02 } from '../../src/rules/mcp-02.js';
import { config, loadFixtureModel } from './helpers.js';

describe('MCP-02 Duplicate servers', () => {
  it('triggers when the same name is defined in global and project scope', async () => {
    const model = await loadFixtureModel('mcp-02-trigger');
    const findings = mcp02.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('MCP server github is defined more than once');
  });

  it('does not trigger for two servers with different commands', async () => {
    const model = await loadFixtureModel('mcp-02-clean');
    expect(mcp02.run({ model, config })).toEqual([]);
  });
});
