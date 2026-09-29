// Collapses model items that two or more agents read from the exact same
// file into a single item, so a real problem in a shared file (e.g. a
// project's .mcp.json, which Claude Code and Copilot CLI both read; or
// .claude/skills, which Copilot CLI also reads directly) is scored once,
// not once per agent that happens to read it. See docs/notes.md's Phase 3
// entry for the research behind this.
//
// Two items are "the same real thing" when every field describing the
// underlying data (not `agent` or `sharedWith` themselves) is identical.
// Adapters are pure functions of file content plus a shared DiscoveryContext,
// so two adapters parsing the same file always agree on every other field;
// this equality check never merges two items that only coincidentally look
// alike. `agent` order in the input (buildModel's fixed per-agent loop
// order) determines which agent becomes primary, so output stays
// deterministic.

import type { Agent } from './types.js';

type Sharable = { agent: Agent; sharedWith?: Agent[] };

// Deterministic regardless of key insertion order (JSON.stringify is not).
function canonicalKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalKey).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalKey((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function dedupSharedAcrossAgents<T extends Sharable>(items: T[]): T[] {
  const order: string[] = [];
  const byKey = new Map<string, T>();

  for (const item of items) {
    const { agent, sharedWith: _sharedWith, ...rest } = item;
    const key = canonicalKey(rest);
    const existing = byKey.get(key);
    if (existing) {
      const others = new Set(existing.sharedWith ?? []);
      others.add(agent);
      existing.sharedWith = [...others].sort();
    } else {
      byKey.set(key, { ...item, sharedWith: undefined });
      order.push(key);
    }
  }

  return order.map((key) => byKey.get(key) as T);
}
