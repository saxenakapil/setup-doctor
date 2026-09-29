// Local score history and regression detection. Post-v1 (docs/notes.md
// backlog: "Score history and regression detection"). No network, no
// telemetry: a single local JSONL file the user's own machine writes and
// reads, same as any other local output this tool produces.
//
// One line is appended per `--ci` run (never on a plain local `doctor` run,
// so everyday interactive use has no surprise file-write side effect).
// `--compare` reads existing history and reports the delta against the most
// recent prior entry; it never needs `--ci` itself to read and print that
// comparison, only to append a new entry or to affect the exit code on a
// regression.

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Agent } from './types.js';

export const HISTORY_FILE_NAME = '.setupdoctor-history.jsonl';

export interface HistoryEntry {
  ts: string; // ISO timestamp of the run
  score: number;
  band: string;
  agentsDetected: Agent[];
  rulesVersion: string;
}

/** Reads and parses every entry in `<projectRoot>/.setupdoctor-history.jsonl`. Never throws: a missing file or an unparseable line is simply skipped (hard rule 7). */
export async function readHistory(projectRoot: string): Promise<HistoryEntry[]> {
  let text: string;
  try {
    text = await readFile(join(projectRoot, HISTORY_FILE_NAME), 'utf8');
  } catch {
    return [];
  }
  const entries: HistoryEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<HistoryEntry>;
      if (typeof parsed.ts === 'string' && typeof parsed.score === 'number' && typeof parsed.band === 'string') {
        entries.push({
          ts: parsed.ts,
          score: parsed.score,
          band: parsed.band,
          agentsDetected: Array.isArray(parsed.agentsDetected) ? (parsed.agentsDetected as Agent[]) : [],
          rulesVersion: typeof parsed.rulesVersion === 'string' ? parsed.rulesVersion : '',
        });
      }
    } catch {
      // one malformed line never invalidates the rest of the file
    }
  }
  return entries;
}

/** Appends one entry as a single JSON line. Never throws: a write failure (read-only filesystem, permissions) is swallowed, matching this tool's "never crash" contract; the caller may still surface it as a warning. */
export async function appendHistoryEntry(projectRoot: string, entry: HistoryEntry): Promise<boolean> {
  try {
    await appendFile(join(projectRoot, HISTORY_FILE_NAME), JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

export interface ScoreComparison {
  previous: HistoryEntry;
  currentScore: number;
  currentRulesVersion: string;
  delta: number;
  regressed: boolean;
  rulesVersionChanged: boolean;
}

/** Compares `currentScore` against the most recent entry in `history` (the last recorded run, not including the current one). Null when there is nothing to compare against yet. */
export function compareToLast(history: HistoryEntry[], currentScore: number, currentRulesVersion: string): ScoreComparison | null {
  if (history.length === 0) return null;
  const previous = history[history.length - 1] as HistoryEntry;
  const delta = currentScore - previous.score;
  return {
    previous,
    currentScore,
    currentRulesVersion,
    delta,
    regressed: delta < 0,
    rulesVersionChanged: previous.rulesVersion !== currentRulesVersion,
  };
}

/** Human-readable one-line summary, used by the terminal report and printed as-is. */
export function formatComparisonLine(comparison: ScoreComparison): string {
  const sign = comparison.delta > 0 ? '+' : '';
  const base = `Score history: ${comparison.previous.score} -> ${comparison.currentScore} (${sign}${comparison.delta}) since ${comparison.previous.ts}`;
  return comparison.rulesVersionChanged
    ? `${base} (rules changed ${comparison.previous.rulesVersion} -> ${comparison.currentRulesVersion}, so this may reflect rule changes, not just setup changes)`
    : base;
}
