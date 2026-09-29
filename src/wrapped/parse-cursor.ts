// Reads Cursor's local SQLite state to build session records. Verified
// against a real, actively used Cursor install on 2026-09-29 (see
// docs/notes.md): Cursor has no session log file at all, its conversation
// history lives in `cursorDiskKV`, a key/value blob table inside
// `state.vscdb` (one global copy, plus one unused copy per workspace).
//
// Key finding that shapes this whole module: per-message timestamps
// (`bubble.createdAt`) are present on some bubbles but absent on most real
// ones (confirmed against composers with dozens of real messages, not just
// trivial two-message ones). Per-message `busiest hour` granularity the way
// Claude Code and Codex get it is therefore not reliable here. This reads
// at composer (conversation) granularity instead: one 'user' record at the
// composer's own `createdAt`, one 'assistant' record at `lastUpdatedAt`
// aggregating every reply/tool-call bubble's token counts and tool names.
// Coarser than the other two agents, but every number in it is real.
//
// Only `tokenCount`, `toolFormerData.name` and the two composer-level
// timestamps are ever read from a bubble; message text, file contents and
// tool arguments/results (which toolFormerData carries in full) are never
// touched, matching the "metadata only" contract the other parsers keep.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDirectory, listDirSafe, readTextFileSafe } from '../adapters/fs-utils.js';
import { openReadOnly, type SqliteDatabase } from './sqlite-loader.js';
import type { PeriodBounds } from './period.js';
import type { SessionRecord, SessionUsage } from '../core/types.js';

// Windows: Cursor stores under %APPDATA%\Cursor, which is homeDir\AppData\Roaming
// on a standard install. Reading process.env.APPDATA would be more exact but
// less deterministic/testable; this matches Cursor's own documented default.
export function cursorUserDir(homeDir: string): string {
  if (process.platform === 'win32') return join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User');
  if (process.platform === 'darwin') return join(homeDir, 'Library', 'Application Support', 'Cursor', 'User');
  return join(homeDir, '.config', 'Cursor', 'User');
}

function numberOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function isoOrNull(epochMs: unknown): string | null {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return null;
  const iso = new Date(epochMs).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function inBounds(ts: string, bounds: PeriodBounds | null): boolean {
  if (!bounds) return true;
  const ms = Date.parse(ts);
  return ms >= bounds.startMs && ms <= bounds.endMs;
}

function fileUriToPath(uri: string): string {
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
  } catch {
    return uri.replace(/^file:\/\//, '');
  }
}

/**
 * Maps composerId -> project path, read from each workspace's own
 * state.vscdb (`ItemTable['composer.composerData'].allComposers`) plus that
 * workspace's `workspace.json`. This mapping, not the `composerHeaders`
 * table (only 3 rows on a real install with dozens of real conversations,
 * see docs/notes.md), is the reliable source: conversation content itself
 * lives only in the global database, never duplicated per workspace.
 */
async function buildProjectMap(userDir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const workspaceStorageDir = join(userDir, 'workspaceStorage');
  if (!(await isDirectory(workspaceStorageDir))) return map;

  for (const entry of await listDirSafe(workspaceStorageDir)) {
    const dir = join(workspaceStorageDir, entry);
    const workspaceJson = await readTextFileSafe(join(dir, 'workspace.json'));
    if (!workspaceJson.ok) continue;
    let folder: string | undefined;
    try {
      const parsed = JSON.parse(workspaceJson.text) as Record<string, unknown>;
      if (typeof parsed.folder === 'string') folder = fileUriToPath(parsed.folder);
    } catch {
      continue;
    }
    if (!folder) continue;

    const db = await openReadOnly(join(dir, 'state.vscdb'));
    if (!db) continue;
    try {
      const rows = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerData'").all();
      const raw = rows[0]?.value;
      if (typeof raw !== 'string') continue;
      const parsed = JSON.parse(raw) as { allComposers?: Array<{ composerId?: string }> };
      for (const c of parsed.allComposers ?? []) {
        if (typeof c.composerId === 'string') map.set(c.composerId, folder);
      }
    } catch {
      // malformed or missing table: this workspace contributes no mappings
    } finally {
      db.close();
    }
  }
  return map;
}

interface ComposerHeader {
  bubbleId?: string;
  type?: number;
}

interface ComposerData {
  composerId?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  modelConfig?: { modelName?: string };
  fullConversationHeadersOnly?: ComposerHeader[];
}

interface BubbleData {
  type?: number;
  tokenCount?: { inputTokens?: number; outputTokens?: number };
  toolFormerData?: { name?: string } | null;
}

function bubblesForComposer(db: SqliteDatabase, composerId: string): Map<string, BubbleData> {
  const out = new Map<string, BubbleData>();
  const prefix = `bubbleId:${composerId}:`;
  const rows = db.prepare('SELECT key, value FROM cursorDiskKV WHERE key LIKE ?').all(`${prefix}%`);
  for (const row of rows) {
    const key = row.key;
    const value = row.value;
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    const bubbleId = key.slice(prefix.length);
    try {
      out.set(bubbleId, JSON.parse(value) as BubbleData);
    } catch {
      // unparseable bubble: skipped, not counted
    }
  }
  return out;
}

function* recordsForComposer(
  db: SqliteDatabase,
  composer: ComposerData,
  project: string,
  bounds: PeriodBounds | null,
): Generator<SessionRecord> {
  const composerId = composer.composerId;
  if (!composerId) return;
  const headers = composer.fullConversationHeadersOnly ?? [];
  if (headers.length === 0) return;

  const createdTs = isoOrNull(composer.createdAt);
  if (createdTs && inBounds(createdTs, bounds)) {
    yield { agent: 'cursor', sessionId: composerId, project, ts: createdTs, kind: 'user', tools: [] };
  }

  const assistantTypeHeaders = headers.filter((h) => h.type === 2 && typeof h.bubbleId === 'string');
  if (assistantTypeHeaders.length === 0) return;

  const bubbles = bubblesForComposer(db, composerId);
  const usage: SessionUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const tools: string[] = [];
  let sawAnyBubble = false;

  for (const header of assistantTypeHeaders) {
    const bubble = bubbles.get(header.bubbleId as string);
    if (!bubble) continue;
    sawAnyBubble = true;
    usage.input += numberOr0(bubble.tokenCount?.inputTokens);
    usage.output += numberOr0(bubble.tokenCount?.outputTokens);
    if (typeof bubble.toolFormerData?.name === 'string') tools.push(bubble.toolFormerData.name);
  }
  if (!sawAnyBubble) return;

  const assistantTs = isoOrNull(composer.lastUpdatedAt) ?? createdTs;
  if (!assistantTs || !inBounds(assistantTs, bounds)) return;

  yield {
    agent: 'cursor',
    sessionId: composerId,
    project,
    ts: assistantTs,
    kind: 'assistant',
    model: composer.modelConfig?.modelName,
    usage,
    tools,
  };
}

export async function* readAllSessions(homeDirArg: string | undefined, bounds: PeriodBounds | null): AsyncGenerator<SessionRecord> {
  const userDir = cursorUserDir(homeDirArg ?? homedir());
  const globalDb = await openReadOnly(join(userDir, 'globalStorage', 'state.vscdb'));
  if (!globalDb) return;

  try {
    const projectMap = await buildProjectMap(userDir);
    const rows = globalDb.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'").all();
    for (const row of rows) {
      const value = row.value;
      if (typeof value !== 'string') continue;
      let composer: ComposerData;
      try {
        composer = JSON.parse(value) as ComposerData;
      } catch {
        continue;
      }
      const project = (composer.composerId && projectMap.get(composer.composerId)) ?? '';
      yield* recordsForComposer(globalDb, composer, project, bounds);
    }
  } finally {
    globalDb.close();
  }
}
