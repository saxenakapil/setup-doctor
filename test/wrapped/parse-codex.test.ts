import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverSessionFiles, parseSessionFile, readAllSessions } from '../../src/wrapped/parse-codex.js';
import type { SessionRecord } from '../../src/core/types.js';

const HOME = join(__dirname, '..', 'fixtures', 'wrapped-codex', 'home');

async function collect(): Promise<SessionRecord[]> {
  const out: SessionRecord[] = [];
  for await (const record of readAllSessions(HOME, null)) out.push(record);
  return out;
}

describe('discoverSessionFiles', () => {
  it('finds rollout files nested under sessions/YYYY/MM/DD', async () => {
    const files = await discoverSessionFiles(HOME);
    expect(files.map((f) => f.path).sort()).toEqual([
      join(HOME, '.codex', 'sessions', '2026', '01', '01', 'rollout-sess-a.jsonl'),
      join(HOME, '.codex', 'sessions', '2026', '01', '02', 'rollout-sess-b.jsonl'),
    ]);
  });

  it('returns nothing when there is no sessions directory at all', async () => {
    const files = await discoverSessionFiles(join(HOME, '..', 'does-not-exist'));
    expect(files).toEqual([]);
  });
});

describe('parseSessionFile / readAllSessions', () => {
  it('ignores unparseable lines and developer-role synthetic messages', async () => {
    const records = await collect();
    // sess-a: 1 UserMessage + 2 token_usage_record = 3. sess-b: 1
    // UserMessage + 1 token_usage_record = 2. Total 5. The garbage line,
    // the developer-role synthetic message, task_started/task_complete
    // and the bare CommandExecution/AgentMessage item_completed events
    // (folded into tools or ignored) contribute no records of their own.
    expect(records).toHaveLength(5);
  });

  it('uses token_usage_record.usage (the per-call delta), not the cumulative thread/turn totals', async () => {
    const records = await collect();
    const assistantRecords = records.filter((r) => r.kind === 'assistant' && r.sessionId === 'sess-a');
    expect(assistantRecords).toHaveLength(2);
    // Fixture's thread_token_usage for the second call is 1800/80, which
    // would silently double count if used instead of the per-call usage
    // (1000/50 then 800/30, summing to the correct 1800/80 across both
    // records rather than 1000/50 + 1800/80).
    expect(assistantRecords[0]?.usage).toEqual({ input: 1000, output: 50, cacheRead: 200, cacheWrite: 0 });
    expect(assistantRecords[1]?.usage).toEqual({ input: 800, output: 30, cacheRead: 700, cacheWrite: 0 });
  });

  it('looks up the model from the matching turn_context by turn_id', async () => {
    const records = await collect();
    const a = records.find((r) => r.kind === 'assistant' && r.sessionId === 'sess-a');
    const b = records.find((r) => r.kind === 'assistant' && r.sessionId === 'sess-b');
    expect(a?.model).toBe('gpt-6-luna');
    expect(b?.model).toBe('gpt-6-sol');
  });

  it('attaches a tool exactly once, to the next token_usage_record after it, never duplicated across records', async () => {
    const records = await collect();
    const assistantRecords = records.filter((r) => r.kind === 'assistant' && r.sessionId === 'sess-a');
    expect(assistantRecords[0]?.tools).toEqual(['CommandExecution']);
    expect(assistantRecords[1]?.tools).toEqual(['CommandExecution']);
    // Two distinct CommandExecution events in the fixture, one attached to
    // each record: two total, not four and not zero.
    const totalToolMentions = assistantRecords.reduce((n, r) => n + r.tools.length, 0);
    expect(totalToolMentions).toBe(2);
  });

  it('yields a user record for a genuine UserMessage, using the project (cwd) from session_meta', async () => {
    const records = await collect();
    const userRecord = records.find((r) => r.kind === 'user' && r.sessionId === 'sess-a');
    expect(userRecord).toBeDefined();
    expect(userRecord?.project).toBe('/Users/dev/project-a');
    expect(userRecord?.agent).toBe('codex');
  });

  it('never yields a record for the developer-role synthetic system message', async () => {
    const records = await collect();
    // Only one user-kind record for sess-a: the developer-role
    // <skills_instructions> line must not also produce one.
    expect(records.filter((r) => r.kind === 'user' && r.sessionId === 'sess-a')).toHaveLength(1);
  });

  it('filters by period bounds', async () => {
    const out: SessionRecord[] = [];
    for await (const record of readAllSessions(HOME, { startMs: Date.parse('2026-01-02T00:00:00.000Z'), endMs: Infinity })) {
      out.push(record);
    }
    expect(out.every((r) => r.sessionId === 'sess-b')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('never retains message text (command output, user prompts, agent replies) on the returned records', async () => {
    const records = await collect();
    const json = JSON.stringify(records);
    expect(json).not.toContain('Fix the bug in main.py');
    expect(json).not.toContain('Fixed it');
    expect(json).not.toContain('What does this repo do');
    expect(json).not.toContain('cat');
  });

  it('parseSessionFile on a single file only yields that file\'s records', async () => {
    const out: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(HOME, '.codex', 'sessions', '2026', '01', '02', 'rollout-sess-b.jsonl'), null)) out.push(r);
    expect(out.every((r) => r.sessionId === 'sess-b')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});
