// Fix mode engine. See docs/scope.md section 14. Stretch goal, Phase 8.
//
// The safe set for v1 is INS-03 (exact duplicate lines within one file)
// only. MCP-02's "identical duplicate entries within one file" cannot
// actually occur in our normalized model: the adapter parses MCP config
// with JSON.parse, which silently collapses duplicate object keys before
// the model is ever built, so there is never a same-file duplicate
// McpServer entry to fix. This engine is written to be rule-agnostic
// (any Finding with `fixable` and a `fixHint` can plug in), so a future
// rule that reaches a genuinely fixable state just needs to populate
// `fixHint` -- but as of Phase 8, INS-03 is the only rule that does.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readTextFileSafe, pathExists } from '../adapters/fs-utils.js';
import { applyLineRemoval, renderDeletionDiff } from './diff.js';
import type { DiscoveryContext, Finding, NormalizedModel, Scope } from './types.js';

export interface FixPlan {
  ruleId: string;
  displayPath: string;
  absolutePath: string;
  scope: Scope;
  before: string;
  after: string;
  diff: string;
  findingMessage: string;
}

export interface SkippedFix {
  finding: Finding;
  reason: string;
}

export async function isProjectDirty(projectRoot: string): Promise<boolean> {
  // The tool never runs git (hard rule 2); per scope.md section 14, the
  // presence of a .git folder alone is treated as "possibly dirty."
  return pathExists(join(projectRoot, '.git'));
}

function resolveAbsolutePath(displayPath: string, ctx: DiscoveryContext): string {
  if (displayPath.startsWith('~/')) return join(ctx.homeDir, displayPath.slice(2));
  return join(ctx.projectRoot, displayPath);
}

export interface PlanFixesOptions {
  ctx: DiscoveryContext;
  scopeFlag: 'project' | 'global' | 'all';
  allowDirty: boolean;
}

export async function planFixes(
  model: NormalizedModel,
  findings: Finding[],
  options: PlanFixesOptions,
): Promise<{ plans: FixPlan[]; skipped: SkippedFix[] }> {
  const plans: FixPlan[] = [];
  const skipped: SkippedFix[] = [];
  const dirty = await isProjectDirty(options.ctx.projectRoot);

  for (const finding of findings) {
    // Never auto-fix a heuristic finding, regardless of `fixable` (defense
    // in depth: no current fixable rule is also heuristic, but the rule is
    // explicit in scope.md section 14).
    if (finding.possible) continue;
    if (!finding.fixable || !finding.fixHint) continue;
    if (!finding.file) {
      skipped.push({ finding, reason: 'finding has no associated file' });
      continue;
    }

    const instructionFile = model.instructions.find((f) => f.path === finding.file);
    const scope: Scope = instructionFile?.scope ?? 'project';

    if (scope === 'global' && options.scopeFlag !== 'global') {
      skipped.push({ finding, reason: 'global file; pass --scope global to edit it' });
      continue;
    }
    if (scope === 'project' && dirty && !options.allowDirty) {
      skipped.push({ finding, reason: 'project may have uncommitted git changes; pass --allow-dirty' });
      continue;
    }

    const absolutePath = resolveAbsolutePath(finding.file, options.ctx);
    const read = await readTextFileSafe(absolutePath);
    if (!read.ok) {
      skipped.push({ finding, reason: `could not read file: ${read.reason}` });
      continue;
    }

    if (finding.fixHint.kind === 'remove-lines') {
      const after = applyLineRemoval(read.text, finding.fixHint.lines);
      if (after === read.text) {
        skipped.push({ finding, reason: 'nothing to change' });
        continue;
      }
      plans.push({
        ruleId: finding.ruleId,
        displayPath: finding.file,
        absolutePath,
        scope,
        before: read.text,
        after,
        diff: renderDeletionDiff(finding.file, read.text, finding.fixHint.lines),
        findingMessage: finding.message,
      });
    } else {
      skipped.push({ finding, reason: 'unsupported fix kind' });
    }
  }

  return { plans, skipped };
}

/** Copies every file a plan would change into <projectRoot>/.setupdoctor-backup/<timestamp>/<scope>/<path>. */
export async function backupFiles(plans: FixPlan[], projectRoot: string, now: Date): Promise<string | null> {
  if (plans.length === 0) return null;
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupRoot = join(projectRoot, '.setupdoctor-backup', timestamp);
  for (const plan of plans) {
    const dest = join(backupRoot, plan.scope, plan.displayPath.replace(/^~\//, ''));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, plan.before, 'utf8');
  }
  return backupRoot;
}

export async function applyFixes(plans: FixPlan[]): Promise<void> {
  for (const plan of plans) {
    await writeFile(plan.absolutePath, plan.after, 'utf8');
  }
}
