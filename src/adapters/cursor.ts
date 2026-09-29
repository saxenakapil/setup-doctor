// Cursor adapter: instructions (.cursorrules, .cursor/rules/*) and MCP
// servers (mcp.json). See docs/scope.md section 8.3. Like Codex, Cursor has
// no skills/plugins/settings concept in this tool's v1 scope.
//
// No local Cursor MCP config or rules files were found to verify against on
// 2026-09-29 (see docs/notes.md), so those follow the documented shape
// directly. Wrapped is different: it was verified against a real, actively
// used Cursor install (see docs/notes.md and src/wrapped/parse-cursor.ts),
// reading `state.vscdb`'s `cursorDiskKV` table via the optional `node:sqlite`
// built-in (Node 22.5+; on older Node this yields nothing, the same
// "unsupported" shape as before, see src/cli.ts's Node-version check). The
// separate `~/.cursor/ai-tracking/ai-code-tracking.db` SQLite file has a
// purpose-built schema but was found empty on a real, active install and is
// not read.

import { join } from 'node:path';
import { estimateTokens } from '../core/tokens.js';
import { extractInlineCodePaths, extractScriptCommands } from '../core/text.js';
import { toDisplayPath } from './display-path.js';
import { isDirectory, listDirSafe, pathExists, readTextFileSafe } from './fs-utils.js';
import { parseMcpJsonFile } from './mcp-json-shape.js';
import { resolvePeriodBounds } from '../wrapped/period.js';
import { readAllSessions as readAllCursorSessions } from '../wrapped/parse-cursor.js';
import type {
  Adapter,
  AdapterResult,
  ConfigError,
  DiscoveryContext,
  HookDef,
  InstructionFile,
  McpServer,
  Period,
  PermissionRule,
  PluginInfo,
  Scope,
  SessionRecord,
  Skill,
  Skipped,
  StaleReference,
} from '../core/types.js';

function includesScope(ctx: DiscoveryContext, wanted: Scope): boolean {
  return ctx.scope === 'all' || ctx.scope === wanted;
}

// ---- Instructions ----

async function readPackageScripts(ctx: DiscoveryContext): Promise<Set<string> | null> {
  const read = await readTextFileSafe(join(ctx.projectRoot, 'package.json'));
  if (!read.ok) return null;
  try {
    const parsed = JSON.parse(read.text) as Record<string, unknown>;
    if (parsed.scripts && typeof parsed.scripts === 'object') {
      return new Set(Object.keys(parsed.scripts as Record<string, unknown>));
    }
  } catch {
    // malformed package.json: script references are unverifiable, not reported stale
  }
  return null;
}

async function computeStaleReferences(
  text: string,
  ctx: DiscoveryContext,
  packageScripts: Set<string> | null,
): Promise<StaleReference[]> {
  const out: StaleReference[] = [];
  for (const ref of extractInlineCodePaths(text)) {
    const exists = await pathExists(join(ctx.projectRoot, ref.target));
    out.push({ target: ref.target, line: ref.line, kind: 'path', exists });
  }
  if (packageScripts) {
    for (const ref of extractScriptCommands(text)) {
      out.push({ target: ref.target, line: ref.line, kind: 'script', exists: packageScripts.has(ref.target) });
    }
  }
  return out;
}

async function buildInstructionFile(
  absPath: string,
  ctx: DiscoveryContext,
  packageScripts: Set<string> | null,
): Promise<{ item: InstructionFile } | { skip: Skipped } | null> {
  const read = await readTextFileSafe(absPath);
  if (!read.ok) {
    if (read.reason === 'not found') return null;
    return { skip: { path: toDisplayPath(absPath, ctx), reason: read.reason } };
  }
  const normalized = read.text.replace(/\r\n/g, '\n');
  return {
    item: {
      agent: 'cursor',
      scope: 'project',
      path: toDisplayPath(absPath, ctx),
      sizeBytes: read.sizeBytes,
      text: normalized,
      lines: normalized.split('\n'),
      estTokens: estimateTokens(normalized),
      staleReferences: await computeStaleReferences(normalized, ctx, packageScripts),
    },
  };
}

async function readInstructions(ctx: DiscoveryContext): Promise<AdapterResult<InstructionFile>> {
  const items: InstructionFile[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (!includesScope(ctx, 'project')) {
    return { items, skipped, warnings };
  }

  const packageScripts = await readPackageScripts(ctx);
  const candidates: string[] = [join(ctx.projectRoot, '.cursorrules')];

  const rulesDir = join(ctx.projectRoot, '.cursor', 'rules');
  if (await isDirectory(rulesDir)) {
    for (const entry of (await listDirSafe(rulesDir)).sort()) {
      if (entry.endsWith('.mdc') || entry.endsWith('.md')) candidates.push(join(rulesDir, entry));
    }
  }

  const seen = new Set<string>();
  for (const path of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    const result = await buildInstructionFile(path, ctx, packageScripts);
    if (!result) continue;
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

// ---- MCP servers ----

async function readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>> {
  const items: McpServer[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];
  const configErrors: ConfigError[] = [];

  if (includesScope(ctx, 'project')) {
    await parseMcpJsonFile(join(ctx.projectRoot, '.cursor', 'mcp.json'), 'mcpServers', 'cursor', 'project', ctx, items, skipped, warnings, configErrors);
  }
  if (includesScope(ctx, 'global')) {
    await parseMcpJsonFile(join(ctx.homeDir, '.cursor', 'mcp.json'), 'mcpServers', 'cursor', 'global', ctx, items, skipped, warnings, configErrors);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, skipped, warnings, configErrors };
}

// ---- No skills, plugins or settings concept for Cursor in v1 scope ----

async function readSkills(): Promise<AdapterResult<Skill>> {
  return { items: [], skipped: [], warnings: [] };
}

async function readPlugins(): Promise<AdapterResult<PluginInfo>> {
  return { items: [], skipped: [], warnings: [] };
}

async function readSettings(): Promise<AdapterResult<HookDef | PermissionRule>> {
  return { items: [], skipped: [], warnings: [] };
}

// ---- Detection and sessions ----

async function detect(ctx: DiscoveryContext): Promise<boolean> {
  const candidates = [
    join(ctx.projectRoot, '.cursorrules'),
    join(ctx.projectRoot, '.cursor'),
  ];
  for (const c of candidates) if (await pathExists(c)) return true;
  return false;
}

async function* readSessions(ctx: DiscoveryContext, period: Period): AsyncGenerator<SessionRecord> {
  const bounds = resolvePeriodBounds(period, new Date());
  yield* readAllCursorSessions(ctx.homeDir, bounds);
}

export const cursorAdapter: Adapter = {
  agent: 'cursor',
  detect,
  readInstructions,
  readSkills,
  readMcp,
  readPlugins,
  readSettings,
  readSessions,
};
