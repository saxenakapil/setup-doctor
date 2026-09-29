// Streaming JSONL reader for GitHub Copilot CLI's session log. Verified
// against a real Copilot CLI 1.0.89 install on 2026-09-29 (see
// docs/notes.md): unlike Codex/Cursor, this needed no reverse-engineering
// at all, the real, on-disk format matched the documented shape the
// adapter's own file header already described.
//
// Each session is one `~/.copilot/session-state/<sessionId>/events.jsonl`
// file, one JSON object per line: `{id, parentId, timestamp, type, data}`.
// Unlike Claude Code and Codex, which require summing per-call deltas
// ourselves, Copilot's own `session.shutdown` event already carries a
// final, aggregated `modelMetrics` object (one entry per model actually
// used, each with its own real `usage` totals) computed by the CLI itself
// -- there is nothing to sum or de-duplicate here, only to read once.
//
// Message text, tool arguments/results and reasoning content are never
// read: only `type`, `timestamp`, `data.model`, `data.toolRequests[].name`,
// `data.modelMetrics`, and `data.context.cwd` are ever extracted.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { isDirectory, listDirSafe, pathExists } from '../adapters/fs-utils.js';
import type { PeriodBounds } from './period.js';
import type { SessionRecord, SessionUsage } from '../core/types.js';

export interface SessionFileRef {
  path: string;
}

export async function discoverSessionFiles(homeDir: string): Promise<SessionFileRef[]> {
  const sessionStateDir = join(homeDir, '.copilot', 'session-state');
  if (!(await isDirectory(sessionStateDir))) return [];
  const out: SessionFileRef[] = [];
  for (const entry of await listDirSafe(sessionStateDir)) {
    const eventsPath = join(sessionStateDir, entry, 'events.jsonl');
    if (await pathExists(eventsPath)) out.push({ path: eventsPath });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function numberOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function inBounds(ts: string, bounds: PeriodBounds | null): boolean {
  if (!bounds) return true;
  const ms = Date.parse(ts);
  return !Number.isNaN(ms) && ms >= bounds.startMs && ms <= bounds.endMs;
}

/**
 * Streams one events.jsonl file. One SessionRecord per `user.message`
 * event (kind: 'user'), and one SessionRecord per model key in each
 * `session.shutdown` event's `modelMetrics` (kind: 'assistant'). A single
 * file can contain more than one start/shutdown cycle (`copilot --resume`
 * continues the same session, appending to the same file), so per-model
 * tool accumulation resets on every `session.start`/after every
 * `session.shutdown`, rather than assuming exactly one cycle per file.
 */
export async function* parseSessionFile(filePath: string, bounds: PeriodBounds | null): AsyncGenerator<SessionRecord> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });

  const sessionId = filePath.split(/[/\\]/).slice(-2, -1)[0] ?? filePath;
  let project = '';
  let toolsByModel = new Map<string, string[]>();

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
      const timestamp = obj.timestamp;
      const data = (obj.data ?? {}) as Record<string, unknown>;

      if (type === 'session.start') {
        const context = (data.context ?? {}) as Record<string, unknown>;
        if (typeof context.cwd === 'string') project = context.cwd;
        toolsByModel = new Map();
        continue;
      }

      if (type === 'user.message') {
        if (typeof timestamp === 'string' && inBounds(timestamp, bounds)) {
          yield { agent: 'copilot', sessionId, project, ts: timestamp, kind: 'user', tools: [] };
        }
        continue;
      }

      if (type === 'assistant.message') {
        const model = data.model;
        const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : [];
        const toolNames = toolRequests
          .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>).name : undefined))
          .filter((n): n is string => typeof n === 'string');
        if (typeof model === 'string' && toolNames.length > 0) {
          const existing = toolsByModel.get(model) ?? [];
          existing.push(...toolNames);
          toolsByModel.set(model, existing);
        }
        continue;
      }

      if (type === 'session.shutdown') {
        if (typeof timestamp === 'string' && inBounds(timestamp, bounds)) {
          const modelMetrics = (data.modelMetrics ?? {}) as Record<string, unknown>;
          for (const [model, raw] of Object.entries(modelMetrics)) {
            const metric = (raw ?? {}) as Record<string, unknown>;
            const usageRaw = (metric.usage ?? {}) as Record<string, unknown>;
            const usage: SessionUsage = {
              input: numberOr0(usageRaw.inputTokens),
              output: numberOr0(usageRaw.outputTokens),
              cacheRead: numberOr0(usageRaw.cacheReadTokens),
              cacheWrite: numberOr0(usageRaw.cacheWriteTokens),
            };
            yield {
              agent: 'copilot',
              sessionId,
              project,
              ts: timestamp,
              kind: 'assistant',
              model,
              usage,
              tools: toolsByModel.get(model) ?? [],
            };
          }
        }
        toolsByModel = new Map();
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
