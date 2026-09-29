// GitHub Copilot CLI adapter: instructions, skills, MCP servers. No
// plugins/marketplace concept found. See docs/notes.md's Phase 3 entry for
// the research this is built from; none of it was verified against a real
// local Copilot CLI install (not installed on the build machine), so it
// follows the documented shapes directly, the same caveat cursor.ts already
// carries for its own sources.
//
// Deliberately built on the same shared parsers claude-code.ts uses
// (mcp-json-shape.ts, claude-settings-shape.ts, skill-shape.ts): Copilot
// CLI is documented to read several of Claude Code's own files directly
// (.claude/skills, .claude/settings.json/settings.local.json, and the
// "portable format" .mcp.json), not a separate format of its own. Reusing
// the exact same parsing code for those paths is also what makes
// dedupSharedAcrossAgents's "same file -> same fields" merge assumption
// safe when both agents are detected in one project.
//
// Hooks are different: Copilot CLI also has its own native hook format
// (.github/hooks/*.json project-level, ~/.copilot/hooks/*.json
// user-level), separate from and combined with (not superseded by) the
// shared .claude/settings.json hooks above -- GitHub's own docs: "hooks
// are loaded from [every source] ... and combined. When the same event
// appears in multiple sources, all hook entries from all sources are
// run." See readCopilotHooksDir below; this is why readSettings reads
// four sources, not two. Source:
// https://docs.github.com/en/copilot/reference/hooks-reference
//
// Not covered (documented gaps, not oversights):
// - .github/instructions/*.instructions.md's `applyTo` glob is not modeled
//   (InstructionFile has no path-scoping field); each file is still audited
//   for token limit, vagueness, secrets, staleness etc, just without acting
//   on which paths it would actually apply to.
// - .github/agents/*.agent.md (Copilot's custom-agent format: persona,
//   tools, handoffs) is a different frontmatter shape than the name +
//   description Claude subagents and Copilot's own Skills use, and is not
//   parsed in this v1 adapter.
// - VS Code's user-level settings.json (a documented alternative MCP
//   server location, nested deep in a large, unrelated-content file) is not
//   read; only .vscode/mcp.json (workspace) and the portable formats are.
// - ~/.copilot/permissions-config.json is not parsed: its own docs say it
//   does not support deny/ask rules or default modes, so there is little
//   of the risky-permission signal SET-01 looks for to extract from it.
// - Native hooks with `type: "http"` (calls a URL) or `"prompt"` (shows a
//   message) are read but produce no HookDef: neither has a shell command
//   or script path, so SET-02 (missing script) cannot say anything useful
//   about them. Flagging an http hook as its own risky-permission-style
//   signal is the same backlog item as "hooks that shell out to network
//   tools" already tracked in docs/notes.md, not a gap specific to Copilot.
// - readSessions always yields nothing. Copilot CLI's session log
//   (~/.copilot/session-state/<id>/events.jsonl) is, unusually, a
//   documented plain JSONL format rather than an opaque SQLite file like
//   Codex/Cursor -- a real candidate for a future Wrapped adapter -- but
//   verifying the actual schema against a real log needs a real local
//   install, which was not available here. See docs/notes.md backlog.

import { join } from 'node:path';
import { estimateTokens } from '../core/tokens.js';
import { extractInlineCodePaths, extractScriptCommands } from '../core/text.js';
import { toDisplayPath } from './display-path.js';
import { isDirectory, listDirSafe, pathExists, readTextFileSafe } from './fs-utils.js';
import { parseMcpJsonFile } from './mcp-json-shape.js';
import { computeHookScriptCheck, readClaudeSettingsFile } from './claude-settings-shape.js';
import { collectSkillFolders } from './skill-shape.js';
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
      agent: 'copilot',
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
  const candidates: string[] = [join(ctx.projectRoot, '.github', 'copilot-instructions.md')];

  const instructionsDir = join(ctx.projectRoot, '.github', 'instructions');
  if (await isDirectory(instructionsDir)) {
    for (const entry of (await listDirSafe(instructionsDir)).sort()) {
      if (entry.endsWith('.instructions.md')) candidates.push(join(instructionsDir, entry));
    }
  }

  for (const path of candidates) {
    const result = await buildInstructionFile(path, ctx, packageScripts);
    if (!result) continue;
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

// ---- Skills ----
// .github/skills is Copilot-specific; .claude/skills and .agents/skills are
// documented as read by Copilot CLI directly, alongside its own. See the
// file header.

async function readSkills(ctx: DiscoveryContext): Promise<AdapterResult<Skill>> {
  const items: Skill[] = [];
  const skipped: Skipped[] = [];

  if (includesScope(ctx, 'global')) {
    await collectSkillFolders(join(ctx.homeDir, '.copilot', 'skills'), 'global', 'copilot', ctx, items, skipped);
    await collectSkillFolders(join(ctx.homeDir, '.agents', 'skills'), 'global', 'copilot', ctx, items, skipped);
  }
  if (includesScope(ctx, 'project')) {
    await collectSkillFolders(join(ctx.projectRoot, '.github', 'skills'), 'project', 'copilot', ctx, items, skipped);
    await collectSkillFolders(join(ctx.projectRoot, '.claude', 'skills'), 'project', 'copilot', ctx, items, skipped);
    await collectSkillFolders(join(ctx.projectRoot, '.agents', 'skills'), 'project', 'copilot', ctx, items, skipped);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings: [] };
}

// ---- MCP servers ----

async function readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>> {
  const items: McpServer[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];
  const configErrors: ConfigError[] = [];

  if (includesScope(ctx, 'project')) {
    await parseMcpJsonFile(join(ctx.projectRoot, '.vscode', 'mcp.json'), 'servers', 'copilot', 'project', ctx, items, skipped, warnings, configErrors);
    await parseMcpJsonFile(join(ctx.projectRoot, '.mcp.json'), 'mcpServers', 'copilot', 'project', ctx, items, skipped, warnings, configErrors);
  }
  if (includesScope(ctx, 'global')) {
    await parseMcpJsonFile(join(ctx.homeDir, '.copilot', 'mcp-config.json'), 'mcpServers', 'copilot', 'global', ctx, items, skipped, warnings, configErrors);
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, skipped, warnings, configErrors };
}

// ---- No plugin/marketplace concept found for Copilot ----

async function readPlugins(): Promise<AdapterResult<PluginInfo>> {
  return { items: [], skipped: [], warnings: [] };
}

// ---- Settings: hooks and permissions ----
// Four sources: the two shared .claude/settings*.json files (see the file
// header), plus Copilot's own native hook format at .github/hooks/*.json
// (project) and ~/.copilot/hooks/*.json (global/personal). See
// ~/.copilot/permissions-config.json's own non-coverage note in the file
// header for permissions specifically.

interface RawCopilotHook {
  type?: 'command' | 'http' | 'prompt';
  bash?: string;
  powershell?: string;
  command?: string;
  exec?: string;
  args?: string[];
}

// Picks the command that would actually run on this host's platform. A
// hook definition may carry both bash and powershell variants for
// cross-platform use; only one is real here. `type: 'http'` and `'prompt'`
// hooks have no shell command at all (no script to existence-check), so
// they yield no command and are skipped by the caller -- flagging a
// network-calling or prompt-only hook as its own signal is a documented
// backlog item (docs/notes.md), not something SET-02 (missing script) can
// meaningfully say anything about.
function deriveCopilotHookCommand(raw: RawCopilotHook): string | undefined {
  if (raw.type && raw.type !== 'command') return undefined;
  if (process.platform === 'win32' && raw.powershell) return raw.powershell;
  if (raw.bash) return raw.bash;
  if (raw.command) return raw.command;
  if (raw.exec) return [raw.exec, ...(raw.args ?? [])].join(' ');
  return raw.powershell;
}

async function readCopilotHooksFile(
  filePath: string,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: (HookDef | PermissionRule)[],
  skipped: Skipped[],
  warnings: string[],
): Promise<void> {
  const read = await readTextFileSafe(filePath);
  if (!read.ok) {
    if (read.reason !== 'not found') skipped.push({ path: toDisplayPath(filePath, ctx), reason: read.reason });
    return;
  }
  const displayPath = toDisplayPath(filePath, ctx);
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch (err) {
    warnings.push(`${displayPath}: invalid JSON (${(err as Error).message})`);
    return;
  }
  const hooksObj = (parsed && typeof parsed === 'object' ? parsed : {} as Record<string, unknown>) as Record<string, unknown>;
  const events = hooksObj.hooks;
  if (!events || typeof events !== 'object') return;

  for (const [event, list] of Object.entries(events as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const command = deriveCopilotHookCommand(raw as RawCopilotHook);
      if (!command) continue;
      items.push({
        agent: 'copilot',
        scope: scopeVal,
        sourcePath: displayPath,
        event,
        command,
        scriptCheck: await computeHookScriptCheck(command, ctx),
      });
    }
  }
}

async function readCopilotHooksDir(
  dirPath: string,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: (HookDef | PermissionRule)[],
  skipped: Skipped[],
  warnings: string[],
): Promise<void> {
  if (!(await isDirectory(dirPath))) return;
  for (const entry of (await listDirSafe(dirPath)).sort()) {
    if (!entry.endsWith('.json')) continue;
    await readCopilotHooksFile(join(dirPath, entry), scopeVal, ctx, items, skipped, warnings);
  }
}

async function readSettings(ctx: DiscoveryContext): Promise<AdapterResult<HookDef | PermissionRule>> {
  const items: (HookDef | PermissionRule)[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (includesScope(ctx, 'project')) {
    await readClaudeSettingsFile(join(ctx.projectRoot, '.claude', 'settings.json'), 'project', 'copilot', ctx, items, skipped, warnings);
    await readClaudeSettingsFile(join(ctx.projectRoot, '.claude', 'settings.local.json'), 'project', 'copilot', ctx, items, skipped, warnings);
    await readCopilotHooksDir(join(ctx.projectRoot, '.github', 'hooks'), 'project', ctx, items, skipped, warnings);
  }
  if (includesScope(ctx, 'global')) {
    await readCopilotHooksDir(join(ctx.homeDir, '.copilot', 'hooks'), 'global', ctx, items, skipped, warnings);
  }

  return { items, skipped, warnings };
}

// ---- Detection and sessions ----

async function detect(ctx: DiscoveryContext): Promise<boolean> {
  // Deliberately only Copilot-unique signals (not .mcp.json, .claude/skills
  // or .claude/settings.json, which Claude Code alone is also sufficient
  // evidence for): a project that only happens to use those shared
  // locations for Claude Code should not also auto-detect Copilot.
  if (await pathExists(join(ctx.homeDir, '.copilot'))) return true;
  const projectCandidates = [
    join(ctx.projectRoot, '.github', 'copilot-instructions.md'),
    join(ctx.projectRoot, '.github', 'instructions'),
    join(ctx.projectRoot, '.github', 'skills'),
    join(ctx.projectRoot, '.github', 'agents'),
    join(ctx.projectRoot, '.github', 'prompts'),
    join(ctx.projectRoot, '.github', 'hooks'),
    join(ctx.projectRoot, '.vscode', 'mcp.json'),
  ];
  for (const c of projectCandidates) {
    if (await pathExists(c)) return true;
  }
  return false;
}

async function* readSessions(_ctx: DiscoveryContext, _period: Period): AsyncGenerator<SessionRecord> {
  // See the file header: a documented JSONL format exists but was not
  // verified against a real local install. Matches section 11.7's "not
  // supported yet" fallback.
  void _ctx;
  void _period;
}

export const copilotAdapter: Adapter = {
  agent: 'copilot',
  detect,
  readInstructions,
  readSkills,
  readMcp,
  readPlugins,
  readSettings,
  readSessions,
};
