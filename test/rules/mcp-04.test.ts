import { describe, expect, it } from 'vitest';
import { mcp04 } from '../../src/rules/mcp-04.js';
import { config, loadFixtureModel } from './helpers.js';

describe('MCP-04 Many servers configured', () => {
  it('triggers when more than the limit are enabled', async () => {
    const model = await loadFixtureModel('mcp-04-trigger');
    const findings = mcp04.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('10 MCP servers configured for claude (limit 8)');
  });

  it('does not trigger for a handful of servers', async () => {
    const model = await loadFixtureModel('mcp-04-clean');
    expect(mcp04.run({ model, config })).toEqual([]);
  });
});
