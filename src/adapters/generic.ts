// Generic adapter: instruction files written for agents Setup Doctor has no
// dedicated adapter for. Only project-root files with well-known names are
// read, and only as instructions. Skills, MCP servers, plugins, settings and
// sessions are not modeled for these agents, so those readers return nothing.
//
// The list is deliberately short. Anything an agent already has an adapter
// for is excluded on purpose: AGENTS.md is read by the Codex adapter, and
// .github/copilot-instructions.md by the Copilot adapter. Reading them here
// too would report every problem twice.

import { join } from 'node:path';
import { estimateTokens } from '../core/tokens.js';
import { extractInlineCodePaths } from '../core/text.js';
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
  SessionRecord,
  Skill,
  Skipped,
  StaleReference,
} from '../core/types.js';
import { toDisplayPath } from './display-path.js';
import { pathExists, readTextFileSafe } from './fs-utils.js';

const INSTRUCTION_FILE_NAMES = ['.windsurfrules', '.clinerules'];

function candidatePaths(ctx: DiscoveryContext): string[] {
  return INSTRUCTION_FILE_NAMES.map((name) => join(ctx.projectRoot, name));
}

async function detect(ctx: DiscoveryContext): Promise<boolean> {
  if (ctx.scope === 'global') return false;
  for (const path of candidatePaths(ctx)) {
    if (await pathExists(path)) return true;
  }
  return false;
}

async function computeStaleReferences(text: string, ctx: DiscoveryContext): Promise<StaleReference[]> {
  const out: StaleReference[] = [];
  for (const ref of extractInlineCodePaths(text)) {
    const exists = await pathExists(join(ctx.projectRoot, ref.target));
    out.push({ target: ref.target, line: ref.line, kind: 'path', exists });
  }
  return out;
}

async function readInstructions(ctx: DiscoveryContext): Promise<AdapterResult<InstructionFile>> {
  const items: InstructionFile[] = [];
  const skipped: Skipped[] = [];
  const warnings: string[] = [];

  if (ctx.scope === 'global') return { items, skipped, warnings };

  for (const absPath of candidatePaths(ctx)) {
    const read = await readTextFileSafe(absPath);
    if (!read.ok) {
      if (read.reason !== 'not found') {
        skipped.push({ path: toDisplayPath(absPath, ctx), reason: read.reason });
      }
      continue;
    }
    const normalized = read.text.replace(/\r\n/g, '\n');
    items.push({
      agent: 'generic',
      scope: 'project',
      path: toDisplayPath(absPath, ctx),
      sizeBytes: read.sizeBytes,
      text: normalized,
      lines: normalized.split('\n'),
      estTokens: estimateTokens(normalized),
      staleReferences: await computeStaleReferences(normalized, ctx),
    });
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, skipped, warnings };
}

async function readSkills(): Promise<AdapterResult<Skill>> {
  return { items: [], skipped: [], warnings: [] };
}

async function readMcp(): Promise<AdapterResult<McpServer>> {
  return { items: [], skipped: [], warnings: [] };
}

async function readPlugins(): Promise<AdapterResult<PluginInfo>> {
  return { items: [], skipped: [], warnings: [] };
}

async function readSettings(): Promise<AdapterResult<HookDef | PermissionRule>> {
  return { items: [], skipped: [], warnings: [] };
}

async function* readSessions(): AsyncGenerator<SessionRecord> {
  // No session logs are known for these agents, so Wrapped has nothing to read.
}

export const genericAdapter: Adapter = {
  agent: 'generic',
  detect,
  readInstructions,
  readSkills,
  readMcp,
  readPlugins,
  readSettings,
  readSessions,
};
