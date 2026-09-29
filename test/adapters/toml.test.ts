import { describe, expect, it } from 'vitest';
import { parseToml } from '../../src/adapters/toml.js';

describe('parseToml', () => {
  it('parses simple key = value pairs', () => {
    const result = parseToml('name = "codex"\nenabled = true\ncount = 3\n');
    expect(result.data).toEqual({ name: 'codex', enabled: true, count: 3 });
  });

  it('parses dotted table headers into nested objects', () => {
    const toml = `
[mcp_servers.node_repl]
command = "node"
args = ["--repl"]

[mcp_servers.node_repl.env]
NODE_ENV = "production"
`;
    const result = parseToml(toml);
    expect(result.data).toEqual({
      mcp_servers: {
        node_repl: {
          command: 'node',
          args: ['--repl'],
          env: { NODE_ENV: 'production' },
        },
      },
    });
  });

  it('parses quoted table header segments containing slashes and @', () => {
    const toml = `
[projects."/Users/kapil/Documents/CHAP"]
trust_level = "trusted"

[plugins."visualize@openai-bundled"]
enabled = true
`;
    const result = parseToml(toml);
    expect(result.data).toEqual({
      projects: { '/Users/kapil/Documents/CHAP': { trust_level: 'trusted' } },
      plugins: { 'visualize@openai-bundled': { enabled: true } },
    });
  });

  it('parses a multi-line array', () => {
    const toml = `
[mcp_servers.demo]
args = [
  "--foo",
  "--bar",
]
`;
    const result = parseToml(toml);
    expect(result.data).toEqual({ mcp_servers: { demo: { args: ['--foo', '--bar'] } } });
  });

  it('ignores comments, including a # inside a quoted string', () => {
    const toml = `
# a leading comment
name = "has # not a comment" # trailing comment
`;
    const result = parseToml(toml);
    expect(result.data).toEqual({ name: 'has # not a comment' });
  });

  it('skips array-of-tables headers without crashing', () => {
    const result = parseToml('[[servers]]\nname = "a"\n');
    expect(result.ok).toBe(true);
  });

  it('never throws on malformed input', () => {
    expect(() => parseToml('[[[not valid\nkey = \nfoo === bar')).not.toThrow();
  });
});
