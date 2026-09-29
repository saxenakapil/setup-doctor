// Proves the cross-agent dedup mechanism end-to-end: a project detected as
// both Claude Code and Copilot, sharing .mcp.json, .claude/skills and
// .claude/settings.json, must produce exactly one finding per real problem
// in those shared files, not one per agent. See docs/notes.md's Phase 3
// entry and src/core/dedup.ts.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/core/runner.js';

const FIXTURE = join(__dirname, '..', 'fixtures', 'dedup-claude-copilot', 'project');
const NO_HOME = join(__dirname, '..', 'fixtures', '__no_home__');

describe('cross-agent dedup: a project with both Claude Code and Copilot signals', () => {
  it('detects both agents', async () => {
    const report = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'all', scope: 'project' });
    expect(report.agentsDetected.slice().sort()).toEqual(['claude', 'copilot']);
  });

  it('reports the shared .mcp.json command-not-found problem exactly once, tagged with both agents', async () => {
    const report = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'all', scope: 'project' });
    const mcp01 = report.findings.filter((f) => f.ruleId === 'MCP-01');
    expect(mcp01).toHaveLength(1);
    expect(mcp01[0]?.agent).toBe('claude');
    expect(mcp01[0]?.sharedWith).toEqual(['copilot']);
  });

  it('reports the shared .claude/skills invalid-frontmatter problem exactly once', async () => {
    const report = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'all', scope: 'project' });
    const skl01 = report.findings.filter((f) => f.ruleId === 'SKL-01');
    expect(skl01).toHaveLength(1);
    expect(skl01[0]?.sharedWith).toEqual(['copilot']);
  });

  it('reports the shared .claude/settings.json risky permission exactly once', async () => {
    const report = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'all', scope: 'project' });
    const set01 = report.findings.filter((f) => f.ruleId === 'SET-01');
    expect(set01).toHaveLength(1);
    expect(set01[0]?.sharedWith).toEqual(['copilot']);
  });

  it('a real problem shared by two agents is only ever deducted from the score once', async () => {
    const both = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'all', scope: 'project' });
    const claudeOnly = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'claude', scope: 'project' });
    // Detecting Copilot too must not change the score for the same
    // underlying files: no double-penalizing under --agent all.
    expect(both.score).toBe(claudeOnly.score);
  });
});
