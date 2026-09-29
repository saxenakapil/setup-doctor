import { describe, expect, it } from 'vitest';
import { mcp01 } from '../../src/rules/mcp-01.js';
import { config, loadFixtureModel } from './helpers.js';

describe('MCP-01 Config problem or command not found', () => {
  it('triggers when a stdio command is not found on PATH', async () => {
    const model = await loadFixtureModel('mcp-01-trigger');
    const findings = mcp01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('not-a-real-binary-xyz-123');
    expect(findings[0]?.message).toContain('was not found on PATH');
  });

  it('does not trigger when the command is on PATH', async () => {
    const model = await loadFixtureModel('mcp-01-clean');
    expect(mcp01.run({ model, config })).toEqual([]);
  });

  it('also triggers on an invalid MCP config file, reported as data not a warning string', () => {
    const model = {
      agents: ['claude' as const],
      instructions: [],
      skills: [],
      mcpServers: [],
      plugins: [],
      hooks: [],
      permissions: [],
      buildManifests: [],
      mcpConfigErrors: [
        { agent: 'claude' as const, scope: 'project' as const, sourcePath: '.mcp.json', message: 'invalid JSON (Unexpected token)' },
      ],
      skipped: [],
      warnings: [],
    };
    const findings = mcp01.run({ model, config });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe('.mcp.json: invalid JSON (Unexpected token)');
  });
});
