// Claude Code adapter: instructions, skills (including subagents), MCP,
// plugins and settings. Sessions land in Phase 5. See docs/scope.md section 8.1.

import { basename, dirname, join } from 'node:path';
import { DISCOVERY_DEPTH_LIMIT } from '../core/defaults.js';
import { estimateTokens } from '../core/tokens.js';
import { extractInlineCodePaths, extractScriptCommands } from '../core/text.js';
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
import { findNestedFiles, isDirectory, listDirSafe, pathExists, readTextFileSafe } from './fs-utils.js';
import { parseMcpJsonFile } from './mcp-json-shape.js';
import { readClaudeSettingsFile } from './claude-settings-shape.js';
import { collectAgentFiles, collectSkillFolders } from './skill-shape.js';
import { toDisplayPath } from './display-path.js';
import { readAllSessions } from '../wrapped/parse-claude.js';
import { resolvePeriodBounds } from '../wrapped/period.js';

function includesScope(ctx: DiscoveryContext, wanted: Scope): boolean {
  return ctx.scope === 'all' || ctx.scope === wanted;
}

// ---- Instructions, including @import resolution ----

const IMPORT_LINE_RE = /^@(\S+)$/;

async function resolveImports(
  text: string,
  baseDir: string,
  homeDir: string,
  depth: number,
  visited: Set<string>,
  warnings: string[],
): Promise<string> {
  if (depth > DISCOVERY_DEPTH_LIMIT) return text;
  const lines = text.split(/\r\n|\n/);
  const out: string[] = [];
  for (const line of lines) {
    const m = IMPORT_LINE_RE.exec(line.trim());
    if (!m) {
      out.push(line);
      continue;
    }
    const importPath = m[1] as string;
    const resolved = importPath.startsWith('~') ? join(homeDir, importPath.slice(1)) : join(baseDir, importPath);
    if (visited.has(resolved)) {
      warnings.push(`Import cycle detected at "${importPath}", left as literal text.`);
      out.push(line);
      continue;
    }
    const read = await readTextFileSafe(resolved);
    if (!read.ok) {
      warnings.push(`Could not resolve import "${importPath}": ${read.reason}.`);
      out.push(line);
      continue;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(resolved);
    const spliced = await resolveImports(read.text, dirname(resolved), homeDir, depth + 1, nextVisited, warnings);
    out.push(spliced);
  }
  return out.join('\n');
}

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
  warnings: string[],
  packageScripts: Set<string> | null,
): Promise<{ item: InstructionFile } | { skip: Skipped } | null> {
  const read = await readTextFileSafe(absPath);
  if (!read.ok) {
    if (read.reason === 'not found') return null;
    return { skip: { path: toDisplayPath(absPath, ctx), reason: read.reason } };
  }
  const withImports = await resolveImports(
    read.text,
    dirname(absPath),
    ctx.homeDir,
    0,
    new Set([absPath]),
    warnings,
  );
  const normalized = withImports.replace(/\r\n/g, '\n');
  return {
    item: {
      agent: 'claude',
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
    candidates.push({ path: join(ctx.homeDir, '.claude', 'CLAUDE.md'), scope: 'global' });
  }
  if (includesScope(ctx, 'project')) {
    candidates.push({ path: join(ctx.projectRoot, 'CLAUDE.md'), scope: 'project' });
    candidates.push({ path: join(ctx.projectRoot, '.claude', 'CLAUDE.md'), scope: 'project' });
    candidates.push({ path: join(ctx.projectRoot, 'CLAUDE.local.md'), scope: 'project' });
    for (const nested of await findNestedFiles(ctx.projectRoot, 'CLAUDE.md', DISCOVERY_DEPTH_LIMIT)) {
      candidates.push({ path: nested, scope: 'project' });
    }
  }

  const packageScripts = includesScope(ctx, 'project') ? await readPackageScripts(ctx) : null;

  for (const { path, scope } of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    const result = await buildInstructionFile(scope, path, ctx, warnings, packageScripts);
    if (!result) continue;
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

// ---- Skills and subagents ----

async function readSkills(ctx: DiscoveryContext): Promise<AdapterResult<Skill>> {
  const items: Skill[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'global')) {
    await collectSkillFolders(join(ctx.homeDir, '.claude', 'skills'), 'global', 'claude', ctx, items, skipped);
    await collectAgentFiles(join(ctx.homeDir, '.claude', 'agents'), 'global', 'claude', ctx, items, skipped);
  }
  if (includesScope(ctx, 'project')) {
    await collectSkillFolders(join(ctx.projectRoot, '.claude', 'skills'), 'project', 'claude', ctx, items, skipped);
    await collectAgentFiles(join(ctx.projectRoot, '.claude', 'agents'), 'project', 'claude', ctx, items, skipped);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

// ---- MCP servers ----

async function readMcpFile(
  filePath: string,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: McpServer[],
  skipped: Skipped[],
  warnings: string[],
  configErrors: ConfigError[],
): Promise<void> {
  await parseMcpJsonFile(filePath, 'mcpServers', 'claude', scopeVal, ctx, items, skipped, warnings, configErrors);
}

async function readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>> {
  const items: McpServer[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];
  const configErrors: ConfigError[] = [];

  if (includesScope(ctx, 'global')) {
    await readMcpFile(join(ctx.homeDir, '.claude.json'), 'global', ctx, items, skipped, warnings, configErrors);
  }
  if (includesScope(ctx, 'project')) {
    await readMcpFile(join(ctx.projectRoot, '.mcp.json'), 'project', ctx, items, skipped, warnings, configErrors);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, skipped, warnings, configErrors };
}

// ---- Plugins ----

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function readEnabledPluginsMap(ctx: DiscoveryContext): Promise<Record<string, boolean>> {
  const read = await readTextFileSafe(join(ctx.homeDir, '.claude', 'settings.json'));
  if (!read.ok) return {};
  try {
    const parsed = JSON.parse(read.text) as Record<string, unknown>;
    const raw = parsed.enabledPlugins;
    if (raw && typeof raw === 'object') return raw as Record<string, boolean>;
  } catch {
    // settings.json parse errors are reported by readSettings; plugins default to enabled here.
  }
  return {};
}

function isPluginEnabled(name: string, enabledMap: Record<string, boolean>): boolean {
  if (name in enabledMap) return enabledMap[name] !== false;
  for (const [key, val] of Object.entries(enabledMap)) {
    if (key.startsWith(`${name}@`)) return val !== false;
  }
  return true;
}

async function readPluginFolder(
  pluginDir: string,
  ctx: DiscoveryContext,
  enabledMap: Record<string, boolean>,
): Promise<{ item: PluginInfo } | { skip: Skipped }> {
  const folderName = basename(pluginDir);
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  const displayManifestPath = toDisplayPath(manifestPath, ctx);

  if (!(await pathExists(manifestPath))) {
    return {
      item: {
        agent: 'claude',
        name: folderName,
        manifestPath: displayManifestPath,
        manifestValid: false,
        manifestError: 'manifest missing',
        skillNames: [],
        commandNames: [],
        enabled: isPluginEnabled(folderName, enabledMap),
      },
    };
  }

  const read = await readTextFileSafe(manifestPath);
  if (!read.ok) return { skip: { path: displayManifestPath, reason: read.reason } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return {
      item: {
        agent: 'claude',
        name: folderName,
        manifestPath: displayManifestPath,
        manifestValid: false,
        manifestError: 'invalid JSON',
        skillNames: [],
        commandNames: [],
        enabled: isPluginEnabled(folderName, enabledMap),
      },
    };
  }

  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const name = typeof obj.name === 'string' ? obj.name : undefined;
  let manifestValid = true;
  let manifestError: string | undefined;
  if (!name) {
    manifestValid = false;
    manifestError = 'missing name';
  } else if (!KEBAB_RE.test(name)) {
    manifestValid = false;
    manifestError = 'name is not kebab-case';
  }
  const version = typeof obj.version === 'string' ? obj.version : undefined;
  const skillNames = Array.isArray(obj.skills)
    ? obj.skills.filter((s): s is string => typeof s === 'string')
    : [];
  const commandNames = Array.isArray(obj.commands)
    ? obj.commands.filter((s): s is string => typeof s === 'string')
    : [];
  const key = name ?? folderName;

  return {
    item: {
      agent: 'claude',
      name: key,
      version,
      manifestPath: displayManifestPath,
      manifestValid,
      manifestError,
      skillNames,
      commandNames,
      enabled: isPluginEnabled(key, enabledMap),
    },
  };
}

async function readPlugins(ctx: DiscoveryContext): Promise<AdapterResult<PluginInfo>> {
  const items: PluginInfo[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'global')) {
    const pluginsDir = join(ctx.homeDir, '.claude', 'plugins');
    const enabledMap = await readEnabledPluginsMap(ctx);
    for (const entry of (await listDirSafe(pluginsDir)).sort()) {
      const folder = join(pluginsDir, entry);
      if (!(await isDirectory(folder))) continue;
      const result = await readPluginFolder(folder, ctx, enabledMap);
      if ('item' in result) items.push(result.item);
      else skipped.push(result.skip);
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, skipped, warnings };
}

// ---- Settings: hooks and permissions ----

async function readSettings(ctx: DiscoveryContext): Promise<AdapterResult<HookDef | PermissionRule>> {
  const items: (HookDef | PermissionRule)[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'global')) {
    await readClaudeSettingsFile(join(ctx.homeDir, '.claude', 'settings.json'), 'global', 'claude', ctx, items, skipped, warnings);
  }
  if (includesScope(ctx, 'project')) {
    await readClaudeSettingsFile(join(ctx.projectRoot, '.claude', 'settings.json'), 'project', 'claude', ctx, items, skipped, warnings);
    await readClaudeSettingsFile(join(ctx.projectRoot, '.claude', 'settings.local.json'), 'project', 'claude', ctx, items, skipped, warnings);
  }

  return { items, skipped, warnings };
}

// ---- Detection and sessions ----

async function detect(ctx: DiscoveryContext): Promise<boolean> {
  if (await pathExists(join(ctx.homeDir, '.claude'))) return true;
  const projectCandidates = [
    join(ctx.projectRoot, 'CLAUDE.md'),
    join(ctx.projectRoot, '.claude'),
    join(ctx.projectRoot, 'CLAUDE.local.md'),
    join(ctx.projectRoot, '.mcp.json'),
  ];
  for (const c of projectCandidates) {
    if (await pathExists(c)) return true;
  }
  return false;
}

async function* readSessions(ctx: DiscoveryContext, period: Period): AsyncGenerator<SessionRecord> {
  const bounds = resolvePeriodBounds(period, new Date());
  yield* readAllSessions(ctx.homeDir, bounds);
}

export const claudeCodeAdapter: Adapter = {
  agent: 'claude',
  detect,
  readInstructions,
  readSkills,
  readMcp,
  readPlugins,
  readSettings,
  readSessions,
};
