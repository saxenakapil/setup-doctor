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
  it('detects only cursor, scores, and never runs claude-only rules', async () => {
    const report = await runDoctor({
      path: CURSOR_FIXTURE + '/project',
      homeDir: CURSOR_FIXTURE + '/nonexistent-home',
      agent: 'cursor',
    });

    expect(report.agentsDetected).toEqual(['cursor']);
    expect(report.score).not.toBeNull();

    const byCategory = Object.fromEntries(report.categories.map((c) => [c.category, c]));
    expect(byCategory.skills?.applicable).toBe(false);
    expect(byCategory.plugins?.applicable).toBe(false);
    expect(byCategory.settings?.applicable).toBe(false);
    expect(byCategory.mcp?.applicable).toBe(true);
    expect(byCategory.instructions?.applicable).toBe(true);

    const ruleIds = report.findings.map((f) => f.ruleId);
    expect(ruleIds.some((id) => id.startsWith('SKL-') || id.startsWith('PLG-') || id.startsWith('SET-'))).toBe(false);
  });

  it('produces a clean (fully applicable-weight, no findings) score for a tidy setup', async () => {
    const report = await runDoctor({
      path: CURSOR_FIXTURE + '/project',
      homeDir: CURSOR_FIXTURE + '/nonexistent-home',
      agent: 'cursor',
    });
    // .cursorrules documents "npm test" (INS-07 satisfied) and mentions no
    // stale paths, no vague rules, no secrets, no duplicate/contradictory
    // rules, one small MCP server -- this fixture should score perfectly.
    expect(report.score).toBe(100);
    expect(report.band).toBe('Excellent');
  });
});
