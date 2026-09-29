// Parses the SKILL.md shape (name + description frontmatter, in a named
// folder) used by Claude Code's skills and subagents. Copilot CLI reads
// this same shape directly from .claude/skills (see docs/notes.md's Phase 3
// entry), so this is shared rather than owned by claude-code.ts alone.

import { join } from 'node:path';
import { extractRelativeRefs } from '../core/text.js';
import type { Agent, DiscoveryContext, RelativeRef, Scope, Skill, Skipped } from '../core/types.js';
import { toDisplayPath } from './display-path.js';
import { isDirectory, listDirSafe, pathExists, readTextFileSafe } from './fs-utils.js';
import { parseFrontmatter } from './frontmatter.js';

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
  agent: Agent,
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
      agent,
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

export async function collectSkillFolders(
  skillsDir: string,
  scopeVal: Scope,
  agent: Agent,
  ctx: DiscoveryContext,
  items: Skill[],
  skipped: Skipped[],
): Promise<void> {
  for (const entry of (await listDirSafe(skillsDir)).sort()) {
    const folder = join(skillsDir, entry);
    if (!(await isDirectory(folder))) continue;
    const skillFile = join(folder, 'SKILL.md');
    if (!(await pathExists(skillFile))) continue;
    const result = await readSkillLikeFile(scopeVal, skillFile, folder, 'skill', agent, ctx);
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }
}

export async function collectAgentFiles(
  agentsDir: string,
  scopeVal: Scope,
  agent: Agent,
  ctx: DiscoveryContext,
  items: Skill[],
  skipped: Skipped[],
): Promise<void> {
  for (const entry of (await listDirSafe(agentsDir)).sort()) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(agentsDir, entry);
    if (await isDirectory(filePath)) continue;
    const result = await readSkillLikeFile(scopeVal, filePath, agentsDir, 'agent', agent, ctx);
    if ('item' in result) items.push(result.item);
    else skipped.push(result.skip);
  }
}
