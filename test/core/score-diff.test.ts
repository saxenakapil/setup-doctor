import { describe, expect, it } from 'vitest';
import { explainScoreChange, formatScoreChange, type ReportSnapshot } from '../../src/core/score-diff.js';
import type { Finding } from '../../src/core/types.js';

function finding(overrides: Partial<Finding>): Finding {
  return {
    ruleId: 'INS-06',
    category: 'instructions',
    severity: 'medium',
    message: 'CLAUDE.md mentions scripts/build.sh which does not exist',
    why: 'why',
    fix: 'fix',
    file: 'CLAUDE.md',
    line: 3,
    ...overrides,
  };
}

function report(overrides: Partial<ReportSnapshot>): ReportSnapshot {
  return { rulesVersion: '1.2.0', score: 90, band: 'Excellent', findings: [], ...overrides };
}

describe('explainScoreChange', () => {
  it('reports no changes for identical reports', () => {
    const change = explainScoreChange(report({ findings: [finding({})] }), report({ findings: [finding({})] }));
    expect(change.added).toEqual([]);
    expect(change.resolved).toEqual([]);
    expect(change.unchanged).toBe(1);
  });

  it('lists new findings and resolved findings', () => {
    const old = finding({ ruleId: 'INS-06', message: 'old problem' });
    const fresh = finding({ ruleId: 'SET-01', message: 'new problem', file: '.claude/settings.json' });
    const change = explainScoreChange(
      report({ score: 90, findings: [old] }),
      report({ score: 75, findings: [fresh] }),
    );
    expect(change.added.map((f) => f.message)).toEqual(['new problem']);
    expect(change.resolved.map((f) => f.message)).toEqual(['old problem']);
    expect(change.unchanged).toBe(0);
  });

  it('does not treat a line shift as a new or resolved finding', () => {
    const before = report({ findings: [finding({ line: 3 })] });
    const after = report({ findings: [finding({ line: 40 })] });
    const change = explainScoreChange(before, after);
    expect(change.added).toEqual([]);
    expect(change.resolved).toEqual([]);
    expect(change.unchanged).toBe(1);
  });

  it('orders new findings most severe first, then by rule and file, so output is deterministic', () => {
    const change = explainScoreChange(
      report({ findings: [] }),
      report({
        findings: [
          finding({ ruleId: 'INS-05', severity: 'low', message: 'vague' }),
          finding({ ruleId: 'SET-01', severity: 'critical', message: 'broad permission', file: '.claude/settings.json' }),
          finding({ ruleId: 'MCP-06', severity: 'medium', message: 'unpinned', file: '.mcp.json' }),
        ],
      }),
    );
    expect(change.added.map((f) => f.ruleId)).toEqual(['SET-01', 'MCP-06', 'INS-05']);
  });

  it('flags when the rule set changed, since differences may come from rules rather than the setup', () => {
    const change = explainScoreChange(report({ rulesVersion: '1.1.0' }), report({ rulesVersion: '1.2.0' }));
    expect(change.rulesVersionChanged).toBe(true);
    expect(formatScoreChange(change)).toContain('the rule set changed');
  });
});

describe('formatScoreChange', () => {
  it('states the score movement with its sign and band transition', () => {
    const text = formatScoreChange(
      explainScoreChange(report({ score: 90, band: 'Excellent' }), report({ score: 72, band: 'Good' })),
    );
    expect(text.split('\n')[0]).toBe('Score 90 -> 72 (-18) (Excellent -> Good)');
  });

  it('says so plainly when either score is null instead of inventing a delta', () => {
    const text = formatScoreChange(explainScoreChange(report({ score: null, band: null }), report({ score: 80 })));
    expect(text).toContain('Score comparison is unavailable');
  });

  it('reports an improvement with a plus sign', () => {
    const text = formatScoreChange(explainScoreChange(report({ score: 60, band: 'Needs work' }), report({ score: 85, band: 'Good' })));
    expect(text.split('\n')[0]).toBe('Score 60 -> 85 (+25) (Needs work -> Good)');
  });
});
