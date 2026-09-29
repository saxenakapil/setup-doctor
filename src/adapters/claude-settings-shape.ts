// Parses the "hooks" + "permissions" shape used by .claude/settings.json
// and .claude/settings.local.json. Copilot CLI reads these same files
// directly for hooks and shared config (see docs/notes.md's Phase 3
// entry), so this is shared rather than owned by claude-code.ts alone.

import { isAbsolute, join } from 'node:path';
import type { Agent, DiscoveryContext, HookDef, PermissionRule, Scope, Skipped } from '../core/types.js';
import { isExecutable, pathExists, readTextFileSafe } from './fs-utils.js';
import { toDisplayPath } from './display-path.js';

function looksLikePath(token: string): boolean {
  return token.startsWith('./') || token.startsWith('../') || token.startsWith('/') || token.startsWith('~/') || token.includes('/');
}

/**
 * Tries indent widths that real settings.json files use (2 spaces, 4
 * spaces, a tab) and returns the one that reproduces `rawText` exactly via
 * `JSON.stringify`. Null when none match: an unusual formatting style
 * (inconsistent indentation, non-standard key order, trailing comments via
 * some non-standard parser, etc.) that this function cannot faithfully
 * reproduce, so a fix must not attempt to rewrite it (see hard rule: never
 * change more than the user asked for).
 */
function detectJsonIndent(rawText: string, parsed: unknown): string | number | null {
  const trimmed = rawText.replace(/\s+$/, '');
  for (const candidate of [2, 4, '\t'] as const) {
    if (JSON.stringify(parsed, null, candidate) === trimmed) return candidate;
  }
  return null;
}

/**
 * SET-02's fix: removes one hook entry (identified by its event and its own
 * command string) from a real, structurally-parsed settings.json object,
 * then re-serializes it. A real JSON edit, not text-level line surgery: no
 * risk of a dangling trailing comma the way blind line deletion inside a
 * JSON array would have. Returns null when the fix cannot be applied
 * safely: invalid JSON, the hook is not found, or (via `detectJsonIndent`)
 * the file's own formatting cannot be reproduced exactly, meaning
 * re-serializing it would silently change parts of the file the caller
 * never asked to touch.
 */
export function removeHookFromSettingsJson(rawText: string, event: string, command: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const hooksObj = obj.hooks;
  if (!hooksObj || typeof hooksObj !== 'object') return null;
  const groups = (hooksObj as Record<string, unknown>)[event];
  if (!Array.isArray(groups)) return null;

  let removed = false;
  const newGroups = groups
    .map((group) => {
      if (!group || typeof group !== 'object') return group;
      const groupObj = group as Record<string, unknown>;
      const hooksArr = groupObj.hooks;
      if (Array.isArray(hooksArr)) {
        const filtered = hooksArr.filter((h) => {
          const match = (h as Record<string, unknown> | undefined)?.command === command;
          if (match) removed = true;
          return !match;
        });
        if (filtered.length === hooksArr.length) return group;
        return filtered.length === 0 ? null : { ...groupObj, hooks: filtered };
      }
      if (typeof groupObj.command === 'string' && groupObj.command === command) {
        removed = true;
        return null;
      }
      return group;
    })
    .filter((g) => g !== null);

  if (!removed) return null;

  const newHooksObj = { ...(hooksObj as Record<string, unknown>) };
  if (newGroups.length === 0) delete newHooksObj[event];
  else newHooksObj[event] = newGroups;

  const newObj = { ...obj };
  if (Object.keys(newHooksObj).length === 0) delete newObj.hooks;
  else newObj.hooks = newHooksObj;

  const indent = detectJsonIndent(rawText, parsed);
  if (indent === null) return null;
  return JSON.stringify(newObj, null, indent) + (rawText.endsWith('\n') ? '\n' : '');
}

export async function computeHookScriptCheck(command: string, ctx: DiscoveryContext): Promise<HookDef['scriptCheck']> {
  const firstToken = command.trim().split(/\s+/)[0];
  if (!firstToken || !looksLikePath(firstToken)) return undefined;
  if (firstToken.includes('${')) return undefined; // e.g. ${CLAUDE_PLUGIN_ROOT}, unresolvable here
  const substituted = firstToken.split('$CLAUDE_PROJECT_DIR').join(ctx.projectRoot);
  if (substituted.includes('$')) return undefined; // other unresolvable variable

  let resolvedPath: string;
  if (substituted.startsWith('~/')) resolvedPath = join(ctx.homeDir, substituted.slice(2));
  else if (isAbsolute(substituted)) resolvedPath = substituted;
  else resolvedPath = join(ctx.projectRoot, substituted);

  const exists = await pathExists(resolvedPath);
  const executable = exists ? await isExecutable(resolvedPath) : true; // don't double-flag a missing file
  return { resolvedPath, exists, executable };
}

export async function extractHooks(
  raw: unknown,
  sourcePath: string,
  scopeVal: Scope,
  agent: Agent,
  ctx: DiscoveryContext,
): Promise<HookDef[]> {
  const out: HookDef[] = [];
  if (!raw || typeof raw !== 'object') return out;
  for (const [event, groupsRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(groupsRaw)) continue;
    for (const group of groupsRaw) {
      if (!group || typeof group !== 'object') continue;
      const groupObj = group as Record<string, unknown>;
      const hooksArr = groupObj.hooks;
      const commands: string[] = [];
      if (Array.isArray(hooksArr)) {
        for (const h of hooksArr) {
          const command = (h as Record<string, unknown> | undefined)?.command;
          if (typeof command === 'string') commands.push(command);
        }
      } else if (typeof groupObj.command === 'string') {
        commands.push(groupObj.command);
      }
      for (const command of commands) {
        out.push({
          agent,
          scope: scopeVal,
          sourcePath,
          event,
          command,
          scriptCheck: await computeHookScriptCheck(command, ctx),
        });
      }
    }
  }
  return out;
}

export function extractPermissions(raw: unknown, sourcePath: string, scopeVal: Scope, agent: Agent): PermissionRule[] {
  const out: PermissionRule[] = [];
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const kind of ['allow', 'deny', 'ask'] as const) {
    const list = obj[kind];
    if (!Array.isArray(list)) continue;
    for (const rule of list) {
      if (typeof rule === 'string') out.push({ agent, scope: scopeVal, sourcePath, kind, rule });
    }
  }
  return out;
}

export async function readClaudeSettingsFile(
  path: string,
  scopeVal: Scope,
  agent: Agent,
  ctx: DiscoveryContext,
  items: (HookDef | PermissionRule)[],
  skipped: Skipped[],
  warnings: string[],
): Promise<void> {
  const read = await readTextFileSafe(path);
  if (!read.ok) {
    if (read.reason !== 'not found') skipped.push({ path: toDisplayPath(path, ctx), reason: read.reason });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch (err) {
    warnings.push(`${toDisplayPath(path, ctx)}: invalid JSON (${(err as Error).message})`);
    return;
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const displayPath = toDisplayPath(path, ctx);
  items.push(...(await extractHooks(obj.hooks, displayPath, scopeVal, agent, ctx)));
  items.push(...extractPermissions(obj.permissions, displayPath, scopeVal, agent));
}
