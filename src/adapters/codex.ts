// Codex adapter: instructions (AGENTS.md) and MCP servers (config.toml).
// See docs/scope.md section 8.2. Codex has no skills/plugins/settings
// concept in this tool's v1 scope (SKL-*/PLG-*/SET-* rules are claude-only
// per docs/rules.md), so those methods always return empty results.
//
// Verified against a real ~/.codex/config.toml on 2026-09-29 (see
// docs/notes.md): `[mcp_servers.<name>]` tables with `command`/`args` and a
// nested `[mcp_servers.<name>.env]` table are real, observed shapes.
// readSessions parses ~/.codex/sessions/**/*.jsonl (see
// wrapped/parse-codex.ts), verified against a real Codex CLI 0.159.0
// install once one was available -- see docs/notes.md's Phase 3-era entry
// for why that had not been possible earlier.

import { join } from 'node:path';
import { DISCOVERY_DEPTH_LIMIT } from '../core/defaults.js';
import { estimateTokens } from '../core/tokens.js';
import { extractInlineCodePaths, extractScriptCommands } from '../core/text.js';
import { computeCommandFound, computeSecretLikeEnvKeys } from './mcp-common.js';
import { toDisplayPath } from './display-path.js';
import { parseToml, type TomlTable } from './toml.js';
import { findNestedFiles, pathExists, readTextFileSafe } from './fs-utils.js';
import { resolvePeriodBounds } from '../wrapped/period.js';
import { readAllSessions as readAllCodexSessions } from '../wrapped/parse-codex.js';
import type {
  Adapter,
  AdapterResult,
  DiscoveryContext,
  HookDef,
  InstructionFile,
  McpServer,
  Period,
  PermissionRule,
  Scope,
  PluginInfo,
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
  scopeVal: Scope,
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
      agent: 'codex',
      scope: scopeVal,
      path: toDisplayPath(absPath, ctx),
      sizeBytes: read.sizeBytes,
      text: normalized,
      lines: normalized.split('\n'),
      estTokens: estimateTokens(normalized),
      staleReferences: scopeVal === 'project' ? await computeStaleReferences(normalized, ctx, packageScripts) : [],
    },
  };
}

async function readInstructions(ctx: DiscoveryContext): Promise<AdapterResult<InstructionFile>> {
  const items: InstructionFile[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const candidates: { path: string; scope: Scope }[] = [];
  if (includesScope(ctx, 'global')) {
    candidates.push({ path: join(ctx.homeDir, '.codex', 'AGENTS.md'), scope: 'global' });
  }
  if (includesScope(ctx, 'project')) {
    candidates.push({ path: join(ctx.projectRoot, 'AGENTS.md'), scope: 'project' });
    for (const nested of await findNestedFiles(ctx.projectRoot, 'AGENTS.md', DISCOVERY_DEPTH_LIMIT)) {
      candidates.push({ path: nested, scope: 'project' });
    }
  }

  const packageScripts = includesScope(ctx, 'project') ? await readPackageScripts(ctx) : null;

  for (const { path, scope } of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    const result = await buildInstructionFile(scope, path, ctx, packageScripts);
    if (!result) continue;
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

// ---- MCP servers ----

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

async function readMcpFromConfigToml(
  ctx: DiscoveryContext,
  items: McpServer[],
  skipped: Skipped[],
  warnings: string[],
): Promise<void> {
  const path = join(ctx.homeDir, '.codex', 'config.toml');
  const read = await readTextFileSafe(path);
  if (!read.ok) {
    if (read.reason !== 'not found') skipped.push({ path: toDisplayPath(path, ctx), reason: read.reason });
    return;
  }
  const displayPath = toDisplayPath(path, ctx);
  let table: TomlTable;
  try {
    table = parseToml(read.text).data;
  } catch (err) {
    warnings.push(`${displayPath}: invalid TOML (${(err as Error).message})`);
    return;
  }

  const mcpServers = asRecord(table.mcp_servers);
  if (!mcpServers) return;

  for (const [name, defRaw] of Object.entries(mcpServers)) {
    const def = asRecord(defRaw);
    if (!def) continue;
    const command = typeof def.command === 'string' ? def.command : undefined;
    const url = typeof def.url === 'string' ? def.url : undefined;
    const args = Array.isArray(def.args) ? def.args.filter((a): a is string => typeof a === 'string') : [];
    const env = asRecord(def.env);
    const disabled = def.enabled === false || def.disabled === true;
    items.push({
      agent: 'codex',
      scope: 'global',
      sourcePath: displayPath,
      name,
      command,
      url,
      args,
      secretLikeEnvKeys: computeSecretLikeEnvKeys(env),
      disabled,
      commandFound: disabled ? undefined : await computeCommandFound(command, url),
    });
  }
}

async function readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>> {
  const items: McpServer[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'global')) {
    await readMcpFromConfigToml(ctx, items, skipped, warnings);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, skipped, warnings };
}

// ---- No skills, plugins or settings concept for Codex in v1 scope ----

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
  if (await pathExists(join(ctx.homeDir, '.codex'))) return true;
  return pathExists(join(ctx.projectRoot, 'AGENTS.md'));
}

async function* readSessions(ctx: DiscoveryContext, period: Period): AsyncGenerator<SessionRecord> {
  // ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl, created lazily on the
  // first real session (verified 2026-09-29 against a real Codex CLI
  // 0.159.0 install -- see docs/notes.md; a fresh install with no session
  // run yet, or one using only the SQLite thread-history index, has no
  // sessions/ directory at all, which readAllSessions already treats as
  // "nothing to read", not an error).
  const bounds = resolvePeriodBounds(period, new Date());
  yield* readAllCodexSessions(ctx.homeDir, bounds);
}

export const codexAdapter: Adapter = {
  agent: 'codex',
  detect,
  readInstructions,
  readSkills,
  readMcp,
  readPlugins,
  readSettings,
  readSessions,
};
