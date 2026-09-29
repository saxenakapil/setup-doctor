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
