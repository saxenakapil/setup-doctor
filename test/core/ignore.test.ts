import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/core/runner.js';

const FIXTURE = join(__dirname, '..', 'fixtures', 'ignore-config', 'project');
const NO_HOME = join(__dirname, '..', 'fixtures', 'ignore-config', 'nonexistent-home');

describe('runDoctor: .setupdoctorrc ignore', () => {
  it('excludes an ignored subtree from discovery entirely, not just from the findings list', async () => {
    const report = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'claude', scope: 'project' });

    // examples/CLAUDE.md has a real-shaped fake secret (INS-08) and
    // .claude/skills/ignored-skill has no frontmatter (SKL-01); both are
    // covered by the fixture's own .setupdoctorrc "ignore" patterns.
    expect(report.findings).toEqual([]);

    // The non-ignored sibling skill is still discovered normally.
    expect(report.model.skills.map((s) => s.path)).toEqual(['.claude/skills/good-skill/SKILL.md']);
    expect(report.model.instructions.map((i) => i.path)).toEqual(['CLAUDE.md']);

    // Never reported as skipped either: an ignored path is excluded from
    // discovery, not "found but unreadable".
    expect(report.skipped.some((s) => s.path.startsWith('examples/'))).toBe(false);

    expect(report.score).toBe(100);
    expect(report.band).toBe('Excellent');
  });

  it('scores the same fixture as if the ignored paths did not exist, when --config points elsewhere', async () => {
    // Without the fixture's own .setupdoctorrc (an explicit config path to
    // a file that has no "ignore" field), the examples/ secret and the
    // broken skill are real findings again -- confirms the clean result
    // above is really from the ignore config, not from the fixture being
    // clean on its own.
    const emptyConfig = join(__dirname, '..', 'fixtures', 'ignore-config', 'empty-config.json');
    const report = await runDoctor({ path: FIXTURE, homeDir: NO_HOME, agent: 'claude', scope: 'project', configPath: emptyConfig });
    const ruleIds = report.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('INS-08');
    expect(ruleIds).toContain('SKL-01');
    expect(report.model.instructions.map((i) => i.path).sort()).toEqual(['CLAUDE.md', 'examples/CLAUDE.md']);
    expect(report.model.skills.map((s) => s.path).sort()).toEqual([
      '.claude/skills/good-skill/SKILL.md',
      '.claude/skills/ignored-skill/SKILL.md',
    ]);
  });
});
