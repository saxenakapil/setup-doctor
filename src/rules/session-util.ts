// Shared helpers for the two session-based rules (SKL-06, MCP-05). Not a
// rule itself. Sessions are supplied by RuleContext.sessions, populated once
// Phase 5's log parser exists; both rules return [] until then.

import type { SessionRecord } from '../core/types.js';

function parseTime(ts: string): number | null {
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

/** True when the records span at least `minDays` from first to last timestamp. */
export function hasCoverageDays(sessions: SessionRecord[], minDays: number): boolean {
  const times = sessions.map((s) => parseTime(s.ts)).filter((t): t is number => t !== null);
  if (times.length === 0) return false;
  const spanDays = (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24);
  return spanDays >= minDays;
}

/** True when any record within `windowDays` of `nowIso` calls a tool starting with `prefix`. */
export function usedToolPrefixInWindow(
  sessions: SessionRecord[],
  prefix: string,
  nowIso: string,
  windowDays: number,
): boolean {
  const now = parseTime(nowIso);
  if (now === null) return false;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  for (const record of sessions) {
    const t = parseTime(record.ts);
    if (t === null || now - t > windowMs || t > now) continue;
    if (record.tools.some((tool) => tool.startsWith(prefix))) return true;
  }
  return false;
}

/** True when any record within `windowDays` of `nowIso` names `skillName` exactly (Skill tool or `/name` command). */
export function usedSkillInWindow(
  sessions: SessionRecord[],
  skillName: string,
  nowIso: string,
  windowDays: number,
): boolean {
  const now = parseTime(nowIso);
  if (now === null) return false;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  for (const record of sessions) {
    const t = parseTime(record.ts);
    if (t === null || now - t > windowMs || t > now) continue;
    if (record.tools.includes(skillName)) return true;
  }
  return false;
}
