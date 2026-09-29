import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleDoctorTool, handleWrappedTool } from '../../src/mcp/tools.js';

const CLEAN_PROJECT = join(__dirname, '..', 'fixtures', 'fix-mode', 'project-clean');
const BROKEN_HOOK_PROJECT = join(__dirname, '..', 'fixtures', 'fix-mode', 'project-broken-hook');
const NONEXISTENT_HOME = join(__dirname, '..', 'fixtures', 'fix-mode', 'nonexistent-home');
const TREND_HOME = join(__dirname, '..', 'fixtures', 'wrapped-trend', 'home');

describe('handleDoctorTool', () => {
  it('returns a real JSON report as text content', async () => {
    const result = await handleDoctorTool({ path: CLEAN_PROJECT, agent: 'claude', scope: 'project' }, NONEXISTENT_HOME);
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    // Real score for this fixture (verified against the built CLI directly):
    // one real INS-03 finding (two repeated rules), 95/100, Excellent band.
    expect(parsed.score).toBe(95);
    expect(parsed.band).toBe('Excellent');
    expect(parsed.agentsDetected).toEqual(['claude']);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].ruleId).toBe('INS-03');
  });

  it('finds real findings for a project with a broken hook', async () => {
    const result = await handleDoctorTool({ path: BROKEN_HOOK_PROJECT, agent: 'claude', scope: 'project' }, NONEXISTENT_HOME);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.score).toBeLessThan(100);
    expect(parsed.findings.some((f: { ruleId: string }) => f.ruleId === 'SET-02')).toBe(true);
  });

  it('applies minSeverity filtering', async () => {
    const all = await handleDoctorTool({ path: BROKEN_HOOK_PROJECT, agent: 'claude', scope: 'project' }, NONEXISTENT_HOME);
    const filtered = await handleDoctorTool(
      { path: BROKEN_HOOK_PROJECT, agent: 'claude', scope: 'project', minSeverity: 'critical' },
      NONEXISTENT_HOME,
    );
    const allParsed = JSON.parse(all.content[0].text);
    const filteredParsed = JSON.parse(filtered.content[0].text);
    expect(filteredParsed.findings.length).toBeLessThanOrEqual(allParsed.findings.length);
    expect(filteredParsed.findings.every((f: { severity: string }) => f.severity === 'critical')).toBe(true);
  });

  it('reports nothing-to-check without crashing when no agent is detected', async () => {
    const emptyDir = join(__dirname, '..', 'fixtures', 'does-not-exist-mcp-test');
    const result = await handleDoctorTool({ path: emptyDir, scope: 'project' }, NONEXISTENT_HOME);
    expect(result.content[0].text).toContain('Nothing to check');
  });
});

describe('handleWrappedTool', () => {
  it('returns a real metrics summary as text content', async () => {
    const result = await handleWrappedTool({ agent: 'claude', period: '2026-01-08:2026-01-14', tz: 'UTC' }, TREND_HOME);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.periodLabel).toBeDefined();
    expect(parsed.metrics.sessions).toBeGreaterThan(0);
    expect(parsed.persona.label).toBeDefined();
  });

  it('hides project names when anonymize is set', async () => {
    const shown = await handleWrappedTool({ agent: 'claude', period: '2026-01-08:2026-01-14', tz: 'UTC' }, TREND_HOME);
    const hidden = await handleWrappedTool(
      { agent: 'claude', period: '2026-01-08:2026-01-14', tz: 'UTC', anonymize: true },
      TREND_HOME,
    );
    const shownParsed = JSON.parse(shown.content[0].text);
    const hiddenParsed = JSON.parse(hidden.content[0].text);
    expect(shownParsed.metrics.topProjects.length).toBeGreaterThan(0);
    expect(hiddenParsed.metrics.topProjects).toEqual([]);
  });

  it('returns an error result for an invalid period', async () => {
    const result = await handleWrappedTool({ agent: 'claude', period: 'not-a-period' }, TREND_HOME);
    expect(result.isError).toBe(true);
  });
});
