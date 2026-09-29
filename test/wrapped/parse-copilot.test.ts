// Fixtures (test/fixtures/wrapped-copilot/home) are hand-written, modeled
// on a real GitHub Copilot CLI 1.0.89 install's ~/.copilot/session-state/
// <id>/events.jsonl (see docs/notes.md), not copied from the real data
// itself, which carries real workspace paths.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverSessionFiles, parseSessionFile, readAllSessions } from '../../src/wrapped/parse-copilot.js';
import type { SessionRecord } from '../../src/core/types.js';

const FIXTURE_HOME = join(__dirname, '..', 'fixtures', 'wrapped-copilot', 'home');
const EMPTY_HOME = join(__dirname, '..', 'fixtures', 'wrapped', 'home'); // has .claude, no .copilot

describe('parse-copilot: discovery', () => {
  it('finds every session-state/<id>/events.jsonl file', async () => {
    const files = await discoverSessionFiles(FIXTURE_HOME);
    expect(files.map((f) => f.path).sort()).toEqual([
      join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-a', 'events.jsonl'),
      join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-b', 'events.jsonl'),
    ]);
  });

  it('returns [] when there is no .copilot/session-state directory at all', async () => {
    expect(await discoverSessionFiles(EMPTY_HOME)).toEqual([]);
  });
});

describe('parse-copilot: parseSessionFile', () => {
  it('yields one user record per user.message, ignoring an unparseable line', async () => {
    const records: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-a', 'events.jsonl'), null)) records.push(r);
    const userRecords = records.filter((r) => r.kind === 'user');
    expect(userRecords).toHaveLength(1);
    expect(userRecords[0]).toMatchObject({ agent: 'copilot', sessionId: 'sess-a', project: '/Users/dev/project-a', ts: '2026-01-01T10:00:01.000Z' });
  });

  it('yields one assistant record per model in session.shutdown\'s modelMetrics, using its real aggregated usage (nothing summed by the parser itself)', async () => {
    const records: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-a', 'events.jsonl'), null)) records.push(r);
    const assistant = records.filter((r) => r.kind === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0]).toMatchObject({
      model: 'gpt-6-luna',
      ts: '2026-01-01T10:00:07.500Z',
      usage: { input: 1000, output: 50, cacheRead: 200, cacheWrite: 0 },
    });
  });

  it('attaches tool names from toolRequests across the whole cycle to the matching model\'s record, exactly once', async () => {
    const records: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-a', 'events.jsonl'), null)) records.push(r);
    const assistant = records.find((r) => r.kind === 'assistant')!;
    expect(assistant.tools).toEqual(['bash']);
  });

  it('a resumed session (two start/shutdown cycles in one file) yields two assistant records under the same sessionId, tools reset between cycles', async () => {
    const records: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-b', 'events.jsonl'), null)) records.push(r);
    const assistant = records.filter((r) => r.kind === 'assistant');
    expect(assistant).toHaveLength(2);
    expect(assistant.every((r) => r.sessionId === 'sess-b')).toBe(true);

    const solRecord = assistant.find((r) => r.model === 'gpt-6-sol')!;
    expect(solRecord.tools).toEqual([]); // first cycle used no tools

    const lunaRecord = assistant.find((r) => r.model === 'gpt-6-luna')!;
    expect(lunaRecord.tools).toEqual(['bash']); // second cycle's own tool, not leaked from the first
  });

  it('filters records outside the period bounds', async () => {
    const bounds = { startMs: Date.parse('2026-01-02T00:00:00Z'), endMs: Date.parse('2026-01-02T23:59:59Z') };
    const records: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-a', 'events.jsonl'), bounds)) records.push(r);
    expect(records).toEqual([]);
  });

  it('never retains message text, tool arguments or reasoning content', async () => {
    const records: SessionRecord[] = [];
    for await (const r of parseSessionFile(join(FIXTURE_HOME, '.copilot', 'session-state', 'sess-a', 'events.jsonl'), null)) records.push(r);
    const json = JSON.stringify(records);
    expect(json).not.toContain('fix the bug');
    expect(json).not.toContain('cat main.py');
  });
});

describe('parse-copilot: readAllSessions', () => {
  it('reads every session file under the home directory', async () => {
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(FIXTURE_HOME, null)) records.push(r);
    const sessionIds = new Set(records.map((r) => r.sessionId));
    expect(sessionIds).toEqual(new Set(['sess-a', 'sess-b']));
  });
});
