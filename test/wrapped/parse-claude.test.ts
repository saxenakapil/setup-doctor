import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverSessionFiles, parseSessionFile, readAllSessions } from '../../src/wrapped/parse-claude.js';
import type { SessionRecord } from '../../src/core/types.js';

const HOME = join(__dirname, '..', 'fixtures', 'wrapped', 'home');

async function collect(): Promise<SessionRecord[]> {
  const out: SessionRecord[] = [];
  for await (const record of readAllSessions(HOME, null)) out.push(record);
  return out;
}

describe('discoverSessionFiles', () => {
  it('finds both session files under the project directory', async () => {
    const files = await discoverSessionFiles(HOME);
    expect(files.map((f) => f.project)).toEqual(['sample-project', 'sample-project']);
    expect(files.map((f) => f.path).sort()).toEqual([
      join(HOME, '.claude', 'projects', 'sample-project', 'sess-a.jsonl'),
      join(HOME, '.claude', 'projects', 'sample-project', 'sess-b.jsonl'),
    ]);
  });
});

describe('parseSessionFile / readAllSessions', () => {
  it('ignores unparseable lines and non-user/assistant types', async () => {
    const records = await collect();
    // 4 genuine records from sess-a (1 real user, 1 deduped assistant, 1
    // real user, 1 assistant) + 2 from sess-b = 6. The queue-operation line,
    // the garbage line and the tool_result-only user line are all dropped.
    expect(records).toHaveLength(6);
  });

  it('deduplicates an assistant turn split across multiple content-block lines by (message.id, requestId)', async () => {
    const records = await collect();
    const assistantAt1000 = records.find((r) => r.kind === 'assistant' && r.ts === '2026-01-01T10:00:05.000Z');
    expect(assistantAt1000).toBeDefined();
    expect(assistantAt1000?.usage).toEqual({ input: 100, output: 50, cacheRead: 0, cacheWrite: 0 });
    // tool_use from the second line of the same (id, requestId) pair is merged in.
    expect(assistantAt1000?.tools).toEqual(['Read']);
  });

  it('drops a "user" line whose content is entirely tool_result blocks', async () => {
    const records = await collect();
    const toolResultEcho = records.find((r) => r.ts === '2026-01-01T10:00:06.000Z');
    expect(toolResultEcho).toBeUndefined();
  });

  it('extracts a slash-command skill name from real user text into tools', async () => {
    const records = await collect();
    const slashCommand = records.find((r) => r.ts === '2026-01-01T10:00:10.000Z');
    expect(slashCommand?.kind).toBe('user');
    expect(slashCommand?.tools).toEqual(['setup-doctor:doctor']);
  });

  it('extracts the invoked skill name from a Skill tool_use block', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'setup-doctor-skill-'));
    try {
      const line = JSON.stringify({
        type: 'assistant',
        sessionId: 'sess-skill',
        timestamp: '2026-01-03T08:00:00.000Z',
        requestId: 'req_skill',
        message: {
          id: 'msg_skill',
          model: 'claude-sonnet-5',
          usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'artifact-design', args: 'free text, never retained' } }],
        },
      });
      writeFileSync(join(dir, 'sess-skill.jsonl'), `${line}\n`);
      const records: SessionRecord[] = [];
      for await (const r of parseSessionFile(join(dir, 'sess-skill.jsonl'), 'proj', null)) records.push(r);
      expect(records).toHaveLength(1);
      expect(records[0]?.tools).toEqual(['Skill', 'artifact-design']);
      expect(JSON.stringify(records)).not.toContain('free text, never retained');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('filters by period bounds', async () => {
    const out: SessionRecord[] = [];
    for await (const record of readAllSessions(HOME, { startMs: Date.parse('2026-01-02T00:00:00.000Z'), endMs: Infinity })) {
      out.push(record);
    }
    expect(out).toHaveLength(2); // only sess-b's two records
    expect(out.every((r) => r.sessionId === 'sess-b')).toBe(true);
  });

  it('never retains message text on the returned records', async () => {
    const records = await collect();
    const json = JSON.stringify(records);
    expect(json).not.toContain('Hello, please fix the bug');
    expect(json).not.toContain('file contents');
  });
});
