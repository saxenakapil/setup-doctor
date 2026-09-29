// Streaming JSONL reader for Codex CLI session logs. Verified against a
// real Codex CLI 0.159.0 install on 2026-09-29 (see docs/notes.md): this
// entire adapter did not exist until then, since no local install was
// available to verify the "not schedulable until a documented schema
// surfaces" backlog item against. See docs/notes.md for what was checked
// and what remains an assumption from limited real sessions (a handful of
// single-and-two-turn exec sessions, not a large real usage history).
//
// Reads line by line, never retains message text beyond the current line:
// a UserMessage's own text is never even read, since Codex's item_completed
// events already say whether a turn was a genuine user message without
// needing to inspect its content. Tool commands and their stdout/stderr in
// CommandExecution items are never read either; only the item's type
// ("CommandExecution") is kept, as the tool label.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { isDirectory, listDirSafe } from '../adapters/fs-utils.js';
import type { PeriodBounds } from './period.js';
import type { SessionRecord, SessionUsage } from '../core/types.js';

export interface SessionFileRef {
  path: string;
}

async function findJsonlFilesRecursive(dir: string, depth: number): Promise<string[]> {
  if (depth <= 0) return [];
  const out: string[] = [];
  for (const entry of await listDirSafe(dir)) {
    const full = join(dir, entry);
    if (entry.endsWith('.jsonl')) {
      out.push(full);
    } else if (await isDirectory(full)) {
      out.push(...(await findJsonlFilesRecursive(full, depth - 1)));
    }
  }
  return out;
}

// Rollout files live under sessions/<year>/<month>/<day>/rollout-*.jsonl,
// but the exact depth is not a documented contract, so this walks a few
// levels deep rather than assuming exactly three.
const MAX_DISCOVERY_DEPTH = 6;

export async function discoverSessionFiles(homeDir: string): Promise<SessionFileRef[]> {
  const sessionsDir = join(homeDir, '.codex', 'sessions');
  if (!(await isDirectory(sessionsDir))) return [];
  const files = await findJsonlFilesRecursive(sessionsDir, MAX_DISCOVERY_DEPTH);
  return files.sort().map((path) => ({ path }));
}

function numberOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// item_completed events whose item.type is one of these represent the
// human/agent turn itself, not a tool call, and are handled separately
// (UserMessage) or ignored for tool-attribution purposes (AgentMessage).
const NON_TOOL_ITEM_TYPES = new Set(['UserMessage', 'AgentMessage']);

/**
 * Streams one rollout file. One SessionRecord per token_usage_record event
 * (Codex's equivalent of one model API response, the same granularity
 * Claude's parser dedupes assistant lines down to); tools accumulate from
 * item_completed events between token_usage_records and attach to the next
 * one, then reset, so a tool is never counted twice. token_usage_record's
 * own `usage` field is the per-call delta; `thread_token_usage` and
 * `turn_token_usage` are running cumulative totals and are not used here,
 * to avoid double-counting (see docs/notes.md for how this was confirmed
 * against a real two-call turn).
 */
export async function* parseSessionFile(filePath: string, bounds: PeriodBounds | null): AsyncGenerator<SessionRecord> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });

  let sessionId: string | null = null;
  let project = '';
  const modelByTurn = new Map<string, string>();
  let pendingTools: string[] = [];

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = obj.type;
      const payload = (obj.payload ?? {}) as Record<string, unknown>;

      if (type === 'session_meta') {
        if (typeof payload.session_id === 'string') sessionId = payload.session_id;
        if (typeof payload.cwd === 'string') project = payload.cwd;
        continue;
      }

      if (!sessionId) continue; // malformed file: no session_meta seen yet

      if (type === 'turn_context') {
        const turnId = payload.turn_id;
        const model = payload.model;
        if (typeof turnId === 'string' && typeof model === 'string') modelByTurn.set(turnId, model);
        continue;
      }

      if (type === 'event_msg' && payload.type === 'item_completed') {
        const item = (payload.item ?? {}) as Record<string, unknown>;
        const itemType = item.type;
        if (itemType === 'UserMessage') {
          const timestamp = payload.started_at_ms ?? payload.completed_at_ms;
          const ts = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : null;
          if (ts && !(bounds && (Date.parse(ts) < bounds.startMs || Date.parse(ts) > bounds.endMs))) {
            yield { agent: 'codex', sessionId, project, ts, kind: 'user', tools: [] };
          }
          continue;
        }
        if (typeof itemType === 'string' && !NON_TOOL_ITEM_TYPES.has(itemType)) {
          pendingTools.push(itemType);
        }
        continue;
      }

      if (type === 'token_usage_record') {
        const turnId = payload.turn_id;
        const usage = (payload.usage ?? {}) as Record<string, unknown>;
        // No per-record timestamp; the enclosing rollout line's own
        // timestamp field (top-level, not in payload) is used instead.
        const timestamp = obj.timestamp;
        if (typeof timestamp !== 'string') continue;
        const ts = Date.parse(timestamp);
        if (Number.isNaN(ts)) continue;
        if (bounds && (ts < bounds.startMs || ts > bounds.endMs)) continue;

        const model = typeof turnId === 'string' ? modelByTurn.get(turnId) : undefined;
        const sessionUsage: SessionUsage = {
          input: numberOr0(usage.input_tokens),
          output: numberOr0(usage.output_tokens),
          cacheRead: numberOr0(usage.cached_input_tokens),
          cacheWrite: numberOr0(usage.cache_write_input_tokens),
        };
        yield {
          agent: 'codex',
          sessionId,
          project,
          ts: timestamp,
          kind: 'assistant',
          model,
          usage: sessionUsage,
          tools: pendingTools,
        };
        pendingTools = [];
        continue;
      }
    }
  } finally {
    rl.close();
  }
}

export async function* readAllSessions(homeDir: string, bounds: PeriodBounds | null): AsyncGenerator<SessionRecord> {
  for (const file of await discoverSessionFiles(homeDir)) {
    yield* parseSessionFile(file.path, bounds);
  }
}
