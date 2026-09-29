// Phase 6 acceptance: "Doctor runs on Codex-only and Cursor-only fixtures;
// rules that do not apply are skipped and do not affect the score."

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/core/runner.js';

const CODEX_FIXTURE = join(__dirname, '..', 'fixtures', 'adapter-codex', 'typical');
const CURSOR_FIXTURE = join(__dirname, '..', 'fixtures', 'adapter-cursor', 'typical');

describe('runDoctor: Codex-only fixture', () => {
  it('detects only codex, scores, and never runs claude-only rules', async () => {
    const report = await runDoctor({
      path: CODEX_FIXTURE + '/project',
      homeDir: CODEX_FIXTURE + '/home',
      agent: 'codex',
    });

    expect(report.agentsDetected).toEqual(['codex']);
    expect(report.score).not.toBeNull();

    // Skills, plugins and settings are never applicable for Codex (no
    // skills/plugins/settings concept in this tool's scope), so those
    // categories must be excluded from the renormalized weight, not scored
    // as if they were empty-and-failing.
    const byCategory = Object.fromEntries(report.categories.map((c) => [c.category, c]));
    expect(byCategory.skills?.applicable).toBe(false);
    expect(byCategory.plugins?.applicable).toBe(false);
    expect(byCategory.settings?.applicable).toBe(false);
    expect(byCategory.mcp?.applicable).toBe(true); // config.toml has mcp_servers
    expect(byCategory.instructions?.applicable).toBe(true);

    // No claude-only rule (SKL-*, PLG-*, SET-*) should ever fire for codex.
    const ruleIds = report.findings.map((f) => f.ruleId);
    expect(ruleIds.some((id) => id.startsWith('SKL-') || id.startsWith('PLG-') || id.startsWith('SET-'))).toBe(false);

    // The fixture plants a hardcoded MCP secret; MCP-03 applies to codex too.
    expect(ruleIds).toContain('MCP-03');
    expect(JSON.stringify(report.findings)).not.toContain('sk-ant-');
  });
});

describe('runDoctor: Cursor-only fixture', () => {
  it('detects only cursor, scores, and never runs claude-only-only rules', async () => {
    const report = await runDoctor({
      path: CURSOR_FIXTURE + '/project',
      homeDir: CURSOR_FIXTURE + '/nonexistent-home',
      agent: 'cursor',
    });

    expect(report.agentsDetected).toEqual(['cursor']);
    expect(report.score).not.toBeNull();

    const byCategory = Object.fromEntries(report.categories.map((c) => [c.category, c]));
    // Skills is now applicable: the fixture has a real project skill under
    // .cursor/skills/, which Cursor's Doctor adapter reads since Phase 17.
    expect(byCategory.skills?.applicable).toBe(true);
    expect(byCategory.plugins?.applicable).toBe(false);
    expect(byCategory.settings?.applicable).toBe(false);
    expect(byCategory.mcp?.applicable).toBe(true);
    expect(byCategory.instructions?.applicable).toBe(true);

    // No plugin or settings/hooks rule (PLG-*, SET-*) should ever fire for
    // cursor: those categories still have no Cursor concept in this tool's
    // scope. SKL-* rules now apply, but the fixture's skill is valid and
    // does not trigger any of them.
    const ruleIds = report.findings.map((f) => f.ruleId);
    expect(ruleIds.some((id) => id.startsWith('PLG-') || id.startsWith('SET-'))).toBe(false);
    expect(ruleIds.some((id) => id.startsWith('SKL-'))).toBe(false);
  });

  it('produces a clean (fully applicable-weight, no findings) score for a tidy setup', async () => {
    const report = await runDoctor({
      path: CURSOR_FIXTURE + '/project',
      homeDir: CURSOR_FIXTURE + '/nonexistent-home',
      agent: 'cursor',
    });
    // .cursorrules documents "npm test" (INS-07 satisfied) and mentions no
    // stale paths, no vague rules, no secrets, no duplicate/contradictory
    // rules, one small MCP server, and one valid, non-overlapping skill --
    // this fixture should score perfectly.
    expect(report.score).toBe(100);
    expect(report.band).toBe('Excellent');
  });

  it('flags a real broken skill under .cursor/skills/ with SKL-01', async () => {
    const fixture = join(__dirname, '..', 'fixtures', 'adapter-cursor', 'skill-broken');
    const report = await runDoctor({
      path: fixture + '/project',
      homeDir: fixture + '/nonexistent-home',
      agent: 'cursor',
    });

    const skl01 = report.findings.find((f) => f.ruleId === 'SKL-01');
    expect(skl01).toBeDefined();
    expect(skl01?.agent).toBe('cursor');
    expect(skl01?.file).toBe('.cursor/skills/broken/SKILL.md');
  });
});
