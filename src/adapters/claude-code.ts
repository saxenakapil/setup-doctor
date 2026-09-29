// Claude Code adapter: instructions, skills (including subagents), MCP,
// plugins and settings. Sessions land in Phase 5. See docs/scope.md section 8.1.

import { basename, dirname, join, relative, sep } from 'node:path';
import { DISCOVERY_DEPTH_LIMIT } from '../core/defaults.js';
import { estimateTokens } from '../core/tokens.js';
import { extractInlineCodePaths, extractRelativeRefs, extractScriptCommands } from '../core/text.js';
import type {
  Adapter,
  AdapterResult,
  DiscoveryContext,
  HookDef,
  InstructionFile,
  McpServer,
  Period,
  PermissionRule,
  PluginInfo,
  RelativeRef,
  Scope,
  SessionRecord,
  Skill,
  Skipped,
  StaleReference,
} from '../core/types.js';
import { parseFrontmatter } from './frontmatter.js';
import { findNestedFiles, isDirectory, listDirSafe, pathExists, readTextFileSafe } from './fs-utils.js';

function includesScope(ctx: DiscoveryContext, wanted: Scope): boolean {
  return ctx.scope === 'all' || ctx.scope === wanted;
}

function toDisplayPath(absPath: string, ctx: DiscoveryContext): string {
  const rel = relative(ctx.projectRoot, absPath);
  if (!rel.startsWith('..') && !rel.startsWith(sep)) {
    return rel.split(sep).join('/') || '.';
  }
  const homeRel = relative(ctx.homeDir, absPath);
  if (!homeRel.startsWith('..') && !homeRel.startsWith(sep)) {
    return `~/${homeRel.split(sep).join('/')}`;
  }
  return absPath;
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

function frontmatterCheck(fm: ReturnType<typeof parseFrontmatter>): { valid: boolean; error?: string } {
  if (!fm.ok) return { valid: false, error: fm.error };
  const name = fm.data.name;
  const description = fm.data.description;
  if (!name || !name.trim()) return { valid: false, error: 'missing name' };
  if (description === undefined) return { valid: false, error: 'missing description' };
  if (!description.trim()) return { valid: false, error: 'empty description' };
  return { valid: true };
}

async function readSkillLikeFile(
  scopeVal: Scope,
  filePath: string,
  folderPath: string,
  kind: 'skill' | 'agent',
  ctx: DiscoveryContext,
): Promise<{ item: Skill } | { skip: Skipped }> {
  const read = await readTextFileSafe(filePath);
  if (!read.ok) return { skip: { path: toDisplayPath(filePath, ctx), reason: read.reason } };
  const text = read.text.replace(/\r\n/g, '\n');
  const fm = parseFrontmatter(text);
  const check = frontmatterCheck(fm);
  const lines = text.split('\n');
  const relativeRefs: RelativeRef[] = [];
  for (const ref of extractRelativeRefs(text)) {
    relativeRefs.push({ ...ref, exists: await pathExists(join(folderPath, ref.target)) });
  }
  return {
    item: {
      agent: 'claude',
      scope: scopeVal,
      path: toDisplayPath(filePath, ctx),
      sizeBytes: read.sizeBytes,
      kind,
      folder: toDisplayPath(folderPath, ctx),
      name: fm.data.name,
      description: fm.data.description,
      frontmatterValid: check.valid,
      frontmatterError: check.error,
      lineCount: lines.length,
      text,
      relativeRefs,
    },
  };
}

async function collectSkillFolders(
  skillsDir: string,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: Skill[],
  skipped: Skipped[],
): Promise<void> {
  for (const entry of (await listDirSafe(skillsDir)).sort()) {
    const folder = join(skillsDir, entry);
    if (!(await isDirectory(folder))) continue;
    const skillFile = join(folder, 'SKILL.md');
    if (!(await pathExists(skillFile))) continue;
    const result = await readSkillLikeFile(scopeVal, skillFile, folder, 'skill', ctx);
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }
}

async function collectAgentFiles(
  agentsDir: string,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: Skill[],
  skipped: Skipped[],
): Promise<void> {
  for (const entry of (await listDirSafe(agentsDir)).sort()) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(agentsDir, entry);
    if (await isDirectory(filePath)) continue;
    const result = await readSkillLikeFile(scopeVal, filePath, agentsDir, 'agent', ctx);
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }
}

async function readSkills(ctx: DiscoveryContext): Promise<AdapterResult<Skill>> {
  const items: Skill[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'global')) {
    await collectSkillFolders(join(ctx.homeDir, '.claude', 'skills'), 'global', ctx, items, skipped);
    await collectAgentFiles(join(ctx.homeDir, '.claude', 'agents'), 'global', ctx, items, skipped);
  }
  if (includesScope(ctx, 'project')) {
    await collectSkillFolders(join(ctx.projectRoot, '.claude', 'skills'), 'project', ctx, items, skipped);
    await collectAgentFiles(join(ctx.projectRoot, '.claude', 'agents'), 'project', ctx, items, skipped);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

// ---- MCP servers ----

function computeSecretLikeEnvKeys(env: unknown): string[] {
  if (!env || typeof env !== 'object') return [];
  const keys: string[] = [];
  for (const [key, rawValue] of Object.entries(env as Record<string, unknown>)) {
    if (typeof rawValue !== 'string') continue;
    const keyLooksSecret = /(key|token|secret|password|passwd|auth)/i.test(key);
    const isLiteral = !rawValue.startsWith('$');
    if (keyLooksSecret && isLiteral && rawValue.length >= 8) {
      keys.push(key);
    }
  }
  return keys;
}

interface RawMcpServer {
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, unknown>;
  disabled?: boolean;
}

async function readMcpFile(
  filePath: string,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: McpServer[],
  skipped: Skipped[],
  warnings: string[],
): Promise<void> {
  const read = await readTextFileSafe(filePath);
  if (!read.ok) {
    if (read.reason !== 'not found') skipped.push({ path: toDisplayPath(filePath, ctx), reason: read.reason });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch (err) {
    warnings.push(`${toDisplayPath(filePath, ctx)}: invalid JSON (${(err as Error).message})`);
    return;
  }
  const mcpServers =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).mcpServers : undefined;
  if (!mcpServers || typeof mcpServers !== 'object') return;

  const displayPath = toDisplayPath(filePath, ctx);
  for (const [name, defRaw] of Object.entries(mcpServers as Record<string, unknown>)) {
    const def = (defRaw ?? {}) as RawMcpServer;
    items.push({
      agent: 'claude',
      scope: scopeVal,
      sourcePath: displayPath,
      name,
      command: typeof def.command === 'string' ? def.command : undefined,
      url: typeof def.url === 'string' ? def.url : undefined,
      args: Array.isArray(def.args) ? def.args.filter((a): a is string => typeof a === 'string') : [],
      secretLikeEnvKeys: computeSecretLikeEnvKeys(def.env),
      disabled: def.disabled === true,
    });
  }
}

async function readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>> {
  const items: McpServer[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'global')) {
    await readMcpFile(join(ctx.homeDir, '.claude.json'), 'global', ctx, items, skipped, warnings);
  }
  if (includesScope(ctx, 'project')) {
    await readMcpFile(join(ctx.projectRoot, '.mcp.json'), 'project', ctx, items, skipped, warnings);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, skipped, warnings };
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

function extractHooks(raw: unknown, sourcePath: string, scopeVal: Scope): HookDef[] {
  const out: HookDef[] = [];
  if (!raw || typeof raw !== 'object') return out;
  for (const [event, groupsRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(groupsRaw)) continue;
    for (const group of groupsRaw) {
      if (!group || typeof group !== 'object') continue;
      const groupObj = group as Record<string, unknown>;
      const hooksArr = groupObj.hooks;
      if (Array.isArray(hooksArr)) {
        for (const h of hooksArr) {
          const command = (h as Record<string, unknown> | undefined)?.command;
          if (typeof command === 'string') out.push({ agent: 'claude', scope: scopeVal, sourcePath, event, command });
        }
      } else if (typeof groupObj.command === 'string') {
        out.push({ agent: 'claude', scope: scopeVal, sourcePath, event, command: groupObj.command });
      }
    }
  }
  return out;
}

function extractPermissions(raw: unknown, sourcePath: string, scopeVal: Scope): PermissionRule[] {
  const out: PermissionRule[] = [];
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const kind of ['allow', 'deny', 'ask'] as const) {
    const list = obj[kind];
    if (!Array.isArray(list)) continue;
    for (const rule of list) {
      if (typeof rule === 'string') out.push({ agent: 'claude', scope: scopeVal, sourcePath, kind, rule });
    }
  }
  return out;
}

async function readSettings(ctx: DiscoveryContext): Promise<AdapterResult<HookDef | PermissionRule>> {
  const items: (HookDef | PermissionRule)[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  async function loadFile(path: string, scopeVal: Scope): Promise<void> {
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
    items.push(...extractHooks(obj.hooks, displayPath, scopeVal));
    items.push(...extractPermissions(obj.permissions, displayPath, scopeVal));
  }

  if (includesScope(ctx, 'global')) {
    await loadFile(join(ctx.homeDir, '.claude', 'settings.json'), 'global');
  }
  if (includesScope(ctx, 'project')) {
    await loadFile(join(ctx.projectRoot, '.claude', 'settings.json'), 'project');
    await loadFile(join(ctx.projectRoot, '.claude', 'settings.local.json'), 'project');
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

async function* readSessions(_ctx: DiscoveryContext, _period: Period): AsyncGenerator<SessionRecord> {
  // Implemented in Phase 5 (docs/scope.md section 11).
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
