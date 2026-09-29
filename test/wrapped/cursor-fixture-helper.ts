// Builds a real, on-disk Cursor state.vscdb fixture using node:sqlite
// itself, shaped the way parse-cursor.ts expects (see its module doc and
// docs/notes.md for what was verified against a real install). Shared
// between parse-cursor.test.ts and adapters/cursor.test.ts so both exercise
// the same real schema instead of two hand-drifted copies of it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cursorUserDir } from '../../src/wrapped/parse-cursor.js';
import { loadSqlite } from '../../src/wrapped/sqlite-loader.js';

export interface FixtureBubble {
  bubbleId: string;
  type: 1 | 2;
  inputTokens?: number;
  outputTokens?: number;
  toolName?: string;
}

export interface FixtureComposer {
  composerId: string;
  createdAt: number;
  lastUpdatedAt: number;
  modelName?: string;
  bubbles: FixtureBubble[];
}

export interface FixtureWorkspace {
  hash: string;
  folder: string;
  composerIds: string[];
}

export async function sqliteAvailable(): Promise<boolean> {
  return (await loadSqlite()) !== null;
}

/** Builds `<homeDir>/<cursor user dir>/globalStorage/state.vscdb` plus one state.vscdb per workspace. */
export async function buildCursorFixture(
  homeDir: string,
  composers: FixtureComposer[],
  workspaces: FixtureWorkspace[] = [],
): Promise<void> {
  const sqlite = await loadSqlite();
  if (!sqlite) throw new Error('node:sqlite unavailable; caller must skip via sqliteAvailable()');

  const userDir = cursorUserDir(homeDir);
  const globalDir = join(userDir, 'globalStorage');
  mkdirSync(globalDir, { recursive: true });
  const globalDb = new sqlite.DatabaseSync(join(globalDir, 'state.vscdb'));
  globalDb.prepare('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)').all();

  const insert = globalDb.prepare('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)');
  for (const c of composers) {
    const composerValue = {
      composerId: c.composerId,
      createdAt: c.createdAt,
      lastUpdatedAt: c.lastUpdatedAt,
      modelConfig: { modelName: c.modelName ?? 'default' },
      fullConversationHeadersOnly: c.bubbles.map((b) => ({ bubbleId: b.bubbleId, type: b.type })),
    };
    insert.all(`composerData:${c.composerId}`, JSON.stringify(composerValue));
    for (const b of c.bubbles) {
      const bubbleValue = {
        type: b.type,
        tokenCount: { inputTokens: b.inputTokens ?? 0, outputTokens: b.outputTokens ?? 0 },
        toolFormerData: b.toolName ? { name: b.toolName } : null,
      };
      insert.all(`bubbleId:${c.composerId}:${b.bubbleId}`, JSON.stringify(bubbleValue));
    }
  }
  globalDb.close();

  for (const w of workspaces) {
    const dir = join(userDir, 'workspaceStorage', w.hash);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'workspace.json'), JSON.stringify({ folder: `file://${w.folder}` }));
    const db = new sqlite.DatabaseSync(join(dir, 'state.vscdb'));
    db.prepare('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)').all();
    db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').all(
      'composer.composerData',
      JSON.stringify({ allComposers: w.composerIds.map((composerId) => ({ composerId })) }),
    );
    db.close();
  }
}
