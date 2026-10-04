import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/core/runner.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'generic-agent');
const NO_HOME = join(FIXTURES, 'nonexistent-home');

describe('runDoctor: generic (any-agent) instruction files', () => {
  it('detects a .windsurfrules file, reports it as a generic agent, and runs the instruction rules on it', async () => {
    const report = await runDoctor({ path: join(FIXTURES, 'trigger', 'project'), homeDir: NO_HOME, agent: 'auto', scope: 'project' });
    expect(report.agentsDetected).toEqual(['generic']);
    expect(report.model.instructions.map((i) => [i.agent, i.path])).toEqual([['generic', '.windsurfrules']]);
    const stale = report.findings.filter((f) => f.ruleId === 'INS-06');
    expect(stale).toHaveLength(1);
    expect(stale[0]?.agent).toBe('generic');
  });

  it('a clean .clinerules file produces no findings', async () => {
    const report = await runDoctor({ path: join(FIXTURES, 'clean', 'project'), homeDir: NO_HOME, agent: 'auto', scope: 'project' });
    expect(report.agentsDetected).toEqual(['generic']);
    expect(report.findings).toEqual([]);
  });

  it('does not double-report AGENTS.md: it stays with the Codex adapter and generic is not detected', async () => {
    const report = await runDoctor({ path: join(FIXTURES, 'agents-md-only', 'project'), homeDir: NO_HOME, agent: 'auto', scope: 'project' });
    expect(report.agentsDetected).toEqual(['codex']);
    expect(report.model.instructions.filter((i) => i.path === 'AGENTS.md')).toHaveLength(1);
    expect(report.model.instructions.some((i) => i.agent === 'generic')).toBe(false);
  });

  it('is only auto-detected: an explicit --agent does not pull in generic instruction files', async () => {
    const report = await runDoctor({ path: join(FIXTURES, 'trigger', 'project'), homeDir: NO_HOME, agent: 'claude', scope: 'project' });
    expect(report.agentsDetected).not.toContain('generic');
    expect(report.model.instructions.some((i) => i.agent === 'generic')).toBe(false);
  });
});
