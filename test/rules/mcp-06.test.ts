import { describe, expect, it } from 'vitest';
import { mcp06, isExactVersionSpec } from '../../src/rules/mcp-06.js';
import { emptyModel } from '../../src/core/runner.js';
import type { McpServer } from '../../src/core/types.js';
import { config, loadFixtureModel } from './helpers.js';

function server(overrides: Partial<McpServer>): McpServer {
  return {
    agent: 'claude',
    scope: 'project',
    sourcePath: '.mcp.json',
    name: 'test',
    command: 'npx',
    args: [],
    secretLikeEnvKeys: [],
    disabled: false,
    ...overrides,
  };
}

function modelWith(...servers: McpServer[]) {
  const model = emptyModel();
  model.mcpServers.push(...servers);
  return model;
}

describe('MCP-06 MCP server launched without an exact package version', () => {
  it('triggers on unpinned npx and uvx launches, one finding each, and names the package', async () => {
    const model = await loadFixtureModel('mcp-06-trigger');
    const findings = mcp06.run({ model, config });
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.message)).toEqual([
      'MCP server filesystem launches @modelcontextprotocol/server-filesystem without an exact version',
      'MCP server latest-tag launches some-package@latest without an exact version',
      'MCP server python-tool launches mcp-server-fetch without an exact version',
    ]);
  });

  it('does not trigger when every launcher pins an exact version and non-launcher commands are ignored', async () => {
    const model = await loadFixtureModel('mcp-06-clean');
    expect(mcp06.run({ model, config })).toEqual([]);
  });

  it('skips disabled servers and servers with no launcher command', () => {
    const model = modelWith(
      server({ name: 'off', disabled: true, args: ['some-package'] }),
      server({ name: 'no-command', command: undefined, args: ['some-package'] }),
    );
    expect(mcp06.run({ model, config })).toEqual([]);
  });

  it('treats a server with no package argument as not triggering', () => {
    const model = modelWith(server({ args: ['-y'] }));
    expect(mcp06.run({ model, config })).toEqual([]);
  });

  it('reads pipx run correctly: the package is after the run subcommand', () => {
    const pinned = modelWith(server({ command: 'pipx', args: ['run', 'tool==1.0.0'] }));
    const unpinned = modelWith(server({ command: 'pipx', args: ['run', 'tool'] }));
    expect(mcp06.run({ model: pinned, config })).toEqual([]);
    expect(mcp06.run({ model: unpinned, config })).toHaveLength(1);
  });

  it('never leaks any environment value into the message', () => {
    const model = modelWith(server({ args: ['pkg'], secretLikeEnvKeys: ['TOKEN'] }));
    const findings = mcp06.run({ model, config });
    expect(JSON.stringify(findings)).not.toMatch(/token/i);
  });
});

describe('isExactVersionSpec', () => {
  it.each([
    ['npx', 'pkg@1.2.3', true],
    ['npx', 'pkg@1.2.3-beta.1', true],
    ['npx', '@scope/pkg@1.2.3', true],
    ['npx', '@scope/pkg', false],
    ['npx', 'pkg@latest', false],
    ['npx', 'pkg@^1.2.0', false],
    ['npx', 'pkg@~1.2', false],
    ['uvx', 'pkg==1.2.3', true],
    ['uvx', 'pkg>=1.2.3', false],
    ['uvx', 'pkg', false],
  ])('%s %s exact=%s', (command, spec, expected) => {
    expect(isExactVersionSpec(command, spec)).toBe(expected);
  });
});
