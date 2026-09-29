// See docs/notes.md for what was verified against a real, actively used
// Cursor install: per-bubble timestamps are unreliable, so this reads at
// composer (conversation) granularity, and project comes from each
// workspace's own state.vscdb, not the near-empty composerHeaders table.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAllSessions } from '../../src/wrapped/parse-cursor.js';
import { buildCursorFixture, sqliteAvailable } from './cursor-fixture-helper.js';
import type { SessionRecord } from '../../src/core/types.js';

const HAS_SQLITE = await sqliteAvailable();

describe.skipIf(!HAS_SQLITE)('parse-cursor (real node:sqlite)', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'setup-doctor-cursor-home-'));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('returns nothing when no Cursor database exists', async () => {
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);
    expect(records).toEqual([]);
  });

  it('yields a user record and an aggregated assistant record for a real composer', async () => {
    await buildCursorFixture(homeDir, [
      {
        composerId: 'c1',
        createdAt: Date.parse('2026-01-01T10:00:00Z'),
        lastUpdatedAt: Date.parse('2026-01-01T10:05:00Z'),
        modelName: 'gpt-5',
        bubbles: [
          { bubbleId: 'b1', type: 1 },
          { bubbleId: 'b2', type: 2, inputTokens: 100, outputTokens: 20, toolName: 'read_file' },
          { bubbleId: 'b3', type: 2, inputTokens: 200, outputTokens: 50 },
        ],
      },
    ]);

    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);

    expect(records).toHaveLength(2);
    const user = records.find((r) => r.kind === 'user')!;
    const assistant = records.find((r) => r.kind === 'assistant')!;
    expect(user.ts).toBe('2026-01-01T10:00:00.000Z');
    expect(user.sessionId).toBe('c1');
    expect(assistant.ts).toBe('2026-01-01T10:05:00.000Z');
    expect(assistant.model).toBe('gpt-5');
    expect(assistant.usage).toEqual({ input: 300, output: 70, cacheRead: 0, cacheWrite: 0 });
    expect(assistant.tools).toEqual(['read_file']);
  });

  it('skips a composer with an empty conversation entirely', async () => {
    await buildCursorFixture(homeDir, [
      { composerId: 'empty', createdAt: Date.now(), lastUpdatedAt: Date.now(), bubbles: [] },
    ]);
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);
    expect(records).toEqual([]);
  });

  it('yields only the user record when there is no assistant reply yet', async () => {
    await buildCursorFixture(homeDir, [
      {
        composerId: 'no-reply',
        createdAt: Date.parse('2026-01-01T00:00:00Z'),
        lastUpdatedAt: Date.parse('2026-01-01T00:00:00Z'),
        bubbles: [{ bubbleId: 'b1', type: 1 }],
      },
    ]);
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('user');
  });

  it('resolves project from a workspace state.vscdb, not the composer record itself', async () => {
    await buildCursorFixture(
      homeDir,
      [
        {
          composerId: 'c1',
          createdAt: Date.parse('2026-01-01T00:00:00Z'),
          lastUpdatedAt: Date.parse('2026-01-01T00:00:00Z'),
          bubbles: [
            { bubbleId: 'b1', type: 1 },
            { bubbleId: 'b2', type: 2, inputTokens: 10, outputTokens: 5 },
          ],
        },
      ],
      [{ hash: 'abc', folder: '/Users/me/my-project', composerIds: ['c1'] }],
    );
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);
    expect(records.every((r) => r.project === '/Users/me/my-project')).toBe(true);
  });

  it('falls back to an empty project string when no workspace claims the composer', async () => {
    await buildCursorFixture(homeDir, [
      {
        composerId: 'orphan',
        createdAt: Date.parse('2026-01-01T00:00:00Z'),
        lastUpdatedAt: Date.parse('2026-01-01T00:00:00Z'),
        bubbles: [
          { bubbleId: 'b1', type: 1 },
          { bubbleId: 'b2', type: 2, inputTokens: 1, outputTokens: 1 },
        ],
      },
    ]);
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);
    expect(records.every((r) => r.project === '')).toBe(true);
  });

  it('filters records outside the period bounds', async () => {
    await buildCursorFixture(homeDir, [
      {
        composerId: 'old',
        createdAt: Date.parse('2020-01-01T00:00:00Z'),
        lastUpdatedAt: Date.parse('2020-01-01T00:00:00Z'),
        bubbles: [
          { bubbleId: 'b1', type: 1 },
          { bubbleId: 'b2', type: 2, inputTokens: 1, outputTokens: 1 },
        ],
      },
    ]);
    const bounds = { startMs: Date.parse('2026-01-01T00:00:00Z'), endMs: Date.parse('2026-12-31T00:00:00Z') };
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, bounds)) records.push(r);
    expect(records).toEqual([]);
  });

  it('never reads message text, tool arguments or tool results, only tokenCount and the tool name', async () => {
    await buildCursorFixture(homeDir, [
      {
        composerId: 'c1',
        createdAt: Date.parse('2026-01-01T00:00:00Z'),
        lastUpdatedAt: Date.parse('2026-01-01T00:05:00Z'),
        bubbles: [
          { bubbleId: 'b1', type: 1 },
          { bubbleId: 'b2', type: 2, inputTokens: 5, outputTokens: 5, toolName: 'run_terminal_cmd' },
        ],
      },
    ]);
    const records: SessionRecord[] = [];
    for await (const r of readAllSessions(homeDir, null)) records.push(r);
    const json = JSON.stringify(records);
    expect(json).not.toContain('rawArgs');
    expect(json).not.toContain('result');
  });
});
