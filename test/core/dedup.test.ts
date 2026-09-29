import { describe, expect, it } from 'vitest';
import { dedupSharedAcrossAgents } from '../../src/core/dedup.js';

interface Item {
  agent: 'claude' | 'copilot' | 'codex';
  sharedWith?: ('claude' | 'copilot' | 'codex')[];
  scope: 'project' | 'global';
  sourcePath: string;
  name: string;
  nested: { command?: string; args: string[] };
}

function item(overrides: Partial<Item>): Item {
  return {
    agent: 'claude',
    scope: 'project',
    sourcePath: '.mcp.json',
    name: 'my-server',
    nested: { args: [] },
    ...overrides,
  };
}

describe('dedupSharedAcrossAgents', () => {
  it('leaves distinct items alone', () => {
    const a = item({ agent: 'claude', name: 'server-a' });
    const b = item({ agent: 'claude', name: 'server-b' });
    const result = dedupSharedAcrossAgents([a, b]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.sharedWith === undefined)).toBe(true);
  });

  it('merges two items that are identical apart from agent, keeping the first agent as primary', () => {
    const a = item({ agent: 'claude' });
    const b = item({ agent: 'copilot' });
    const result = dedupSharedAcrossAgents([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.agent).toBe('claude');
    expect(result[0]?.sharedWith).toEqual(['copilot']);
  });

  it('handles three agents sharing one item, sorted and deduplicated', () => {
    const result = dedupSharedAcrossAgents([
      item({ agent: 'codex' }),
      item({ agent: 'claude' }),
      item({ agent: 'copilot' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.agent).toBe('codex');
    expect(result[0]?.sharedWith).toEqual(['claude', 'copilot']);
  });

  it('does not merge items that differ in a nested field, even with the same sourcePath', () => {
    const a = item({ agent: 'claude', nested: { command: 'foo', args: [] } });
    const b = item({ agent: 'copilot', nested: { command: 'bar', args: [] } });
    const result = dedupSharedAcrossAgents([a, b]);
    expect(result).toHaveLength(2);
  });

  it('is insensitive to object key insertion order (deterministic canonical key)', () => {
    const a: Item = { agent: 'claude', scope: 'project', sourcePath: 'x', name: 'n', nested: { args: [], command: 'c' } };
    const b: Item = { nested: { command: 'c', args: [] }, name: 'n', sourcePath: 'x', scope: 'project', agent: 'copilot' };
    const result = dedupSharedAcrossAgents([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.sharedWith).toEqual(['copilot']);
  });

  it('ignores any pre-existing sharedWith value on the input items themselves', () => {
    const a = item({ agent: 'claude', sharedWith: ['codex'] });
    const b = item({ agent: 'copilot' });
    const result = dedupSharedAcrossAgents([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.sharedWith).toEqual(['copilot']);
  });

  it('returns an empty array for empty input', () => {
    expect(dedupSharedAcrossAgents([])).toEqual([]);
  });
});
