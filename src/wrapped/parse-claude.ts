// Streaming JSONL reader for Claude Code session logs. See docs/scope.md
// section 11.1. Verified against real logs on 2026-09-29 (see docs/notes.md
// for what changed from the spec's literal reading).
//
// Reads line by line (node:readline over a stream), parses only the
// metadata fields listed in section 11.1, and never retains message text
// beyond the current line: a user line's text is reduced immediately to
// (a) whether it counts as a genuine human record and (b) an optional
// slash-command skill name, then discarded.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { isDirectory, listDirSafe } from '../adapters/fs-utils.js';
import type { PeriodBounds } from './period.js';
import type { SessionRecord, SessionUsage } from '../core/types.js';

export interface SessionFileRef {
  path: string;
  // The raw encoded project directory name (Claude Code replaces "/" with
  // "-"), used as-is as a display label. Decoding it back to a real path is
  // ambiguous (hyphens in real segment names collide with the separator),
  // so no attempt is made to reverse it; see docs/notes.md.
  project: string;
}

export async function discoverSessionFiles(homeDir: string): Promise<SessionFileRef[]> {
  const projectsDir = join(homeDir, '.claude', 'projects');
  const out: SessionFileRef[] = [];
  for (const entry of await listDirSafe(projectsDir)) {
    const dir = join(projectsDir, entry);
    if (!(await isDirectory(dir))) continue;
    for (const file of await listDirSafe(dir)) {
      if (file.endsWith('.jsonl')) out.push({ path: join(dir, file), project: entry });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function numberOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// A real slash command line is just "/name ..." with nothing before it.
// Free text that happens to start with "/" (e.g. describing a URL path) is
// an unavoidable false positive of this heuristic; see docs/notes.md.
const SLASH_COMMAND_RE = /^\/([A-Za-z0-9][A-Za-z0-9_:-]*)/;

function extractSlashCommandSkill(text: string): string | null {
  const m = SLASH_COMMAND_RE.exec(text.trim());
  return m ? (m[1] as string) : null;
}

interface AssistantEntry {
  sessionId: string;
  ts: string;
  model?: string;
  usage: SessionUsage;
  tools: string[];
}

function toAssistantRecord(project: string, entry: AssistantEntry): SessionRecord {
  return {
    agent: 'claude',
    sessionId: entry.sessionId,
    project,
    ts: entry.ts,
    kind: 'assistant',
    model: entry.model,
    usage: entry.usage,
    tools: entry.tools,
  };
}

// Bounds how many in-flight assistant turns are buffered for dedup at once,
// so a pathologically large single session file still streams in bounded
// memory (docs/scope.md section 16: under 200 MB for 1 GB of logs) rather
// than buffering every distinct turn in the file until EOF.
const MAX_BUFFERED_TURNS = 4000;
const FLUSH_BATCH = 1000;

/**
 * Streams one session file. Assistant lines are deduplicated by the pair
 * (message.id, requestId): multiple JSONL lines can share a pair (one per
 * content block of the same logical turn), each repeating the same usage
 * totals but contributing different tool_use blocks, so tool names are
 * merged across the pair and usage is taken once.
 */
export async function* parseSessionFile(
  filePath: string,
  project: string,
  bounds: PeriodBounds | null,
): AsyncGenerator<SessionRecord> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
  const buffer = new Map<string, AssistantEntry>();

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // ignore lines that do not parse
      }

      const type = obj.type;
      if (type !== 'user' && type !== 'assistant') continue;

      const timestamp = obj.timestamp;
      if (typeof timestamp !== 'string') continue;
      const ts = Date.parse(timestamp);
      if (Number.isNaN(ts)) continue;
      if (bounds && (ts < bounds.startMs || ts > bounds.endMs)) continue;

      const sessionId = obj.sessionId;
      if (typeof sessionId !== 'string') continue;

      const message = (obj.message ?? {}) as Record<string, unknown>;
      const content = message.content;

      if (type === 'user') {
        let isGenuineUserRecord = false;
        const tools: string[] = [];
        const textItems: string[] =
          typeof content === 'string'
            ? [content]
            : Array.isArray(content)
              ? content
                  .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text')
                  .map((c) => c.text)
                  .filter((t): t is string => typeof t === 'string')
              : [];
        for (const text of textItems) {
          isGenuineUserRecord = true;
          const skill = extractSlashCommandSkill(text);
          if (skill) tools.push(skill);
        }
        // A "user" line whose content is entirely tool_result blocks is
        // Claude Code echoing a tool result back through the transcript,
        // not something the human typed. Skip it: counting it would
        // dominate "busiest hour" and other engagement metrics with tool
        // round-trip timing instead of human activity. See docs/notes.md.
        if (!isGenuineUserRecord) continue;

        yield { agent: 'claude', sessionId, project, ts: timestamp, kind: 'user', tools };
        continue;
      }

      // assistant
      const id = message.id;
      if (typeof id !== 'string') continue;
      const requestId = obj.requestId;
      const key = `${id}::${typeof requestId === 'string' ? requestId : ''}`;

      let entry = buffer.get(key);
      if (!entry) {
        const usage = (message.usage ?? {}) as Record<string, unknown>;
        entry = {
          sessionId,
          ts: timestamp,
          model: typeof message.model === 'string' ? message.model : undefined,
          usage: {
            input: numberOr0(usage.input_tokens),
            output: numberOr0(usage.output_tokens),
            cacheRead: numberOr0(usage.cache_read_input_tokens),
            cacheWrite: numberOr0(usage.cache_creation_input_tokens),
          },
          tools: [],
        };
        buffer.set(key, entry);

        if (buffer.size > MAX_BUFFERED_TURNS) {
          const oldestKeys = [...buffer.keys()].slice(0, FLUSH_BATCH);
          for (const oldKey of oldestKeys) {
            const oldEntry = buffer.get(oldKey);
            buffer.delete(oldKey);
            if (oldEntry) yield toAssistantRecord(project, oldEntry);
          }
        }
      }

      if (Array.isArray(content)) {
        for (const item of content) {
          if (!item || typeof item !== 'object') continue;
          const c = item as Record<string, unknown>;
          if (c.type === 'tool_use' && typeof c.name === 'string') {
            entry.tools.push(c.name);
            if (c.name === 'Skill') {
              const input = c.input as Record<string, unknown> | undefined;
              if (input && typeof input.skill === 'string') entry.tools.push(input.skill);
            }
          }
        }
      }
    }
  } finally {
    rl.close();
  }

  for (const entry of buffer.values()) {
    yield toAssistantRecord(project, entry);
  }
}

export async function* readAllSessions(homeDir: string, bounds: PeriodBounds | null): AsyncGenerator<SessionRecord> {
  for (const file of await discoverSessionFiles(homeDir)) {
    yield* parseSessionFile(file.path, file.project, bounds);
  }
}
