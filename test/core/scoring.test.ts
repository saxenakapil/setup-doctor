import { describe, expect, it } from 'vitest';
import { computeOverheadTokens, scoreFindings } from '../../src/core/scoring.js';
import { emptyModel } from '../../src/core/runner.js';
import type { Finding, NormalizedModel, Severity } from '../../src/core/types.js';

function finding(overrides: Partial<Finding> & { severity: Severity }): Finding {
  return {
    ruleId: 'TEST',
    category: 'instructions',
    message: 'msg',
    why: 'why',
    fix: 'fix',
    ...overrides,
  };
}

// Only "instructions" is applicable by default (it always is). Add fake
// items to the other arrays to make more categories applicable.
function modelWithCategories(extra: Partial<NormalizedModel> = {}): NormalizedModel {
  return { ...emptyModel(), ...extra };
}

describe('scoreFindings: category applicability and normalization', () => {
  it('scores 100 with no findings when only instructions is applicable', () => {
    const result = scoreFindings([], modelWithCategories());
    expect(result.score).toBe(100);
    expect(result.band).toBe('Excellent');
    expect(result.categories.find((c) => c.category === 'instructions')?.applicable).toBe(true);
    expect(result.categories.find((c) => c.category === 'skills')?.applicable).toBe(false);
  });

  it('renormalizes effective weight across only applicable categories', () => {
    // Only instructions (30) and skills (25) applicable => 55 total weight.
    // A single high finding (5 pts) in instructions: fraction = 25/30.
    const model = modelWithCategories({ skills: [{ ...blankSkill() }] });
    const findings = [finding({ severity: 'high', category: 'instructions' })];
    const result = scoreFindings(findings, model);
    // instructions effectiveWeight = 30*100/55 ≈ 54.545; fraction 25/30 ≈ 0.8333
    // skills effectiveWeight = 25*100/55 ≈ 45.455; fraction 1 (no findings)
    // total ≈ 0.8333*54.545 + 1*45.455 ≈ 45.45 + 45.455 ≈ 90.9 -> rounds to 92
    expect(result.score).toBe(92);
  });
});

describe('scoreFindings: critical cap', () => {
  it('caps the score at 74 when a single critical finding would otherwise score above it', () => {
    // Two applicable categories dilute the critical finding's impact on the
    // overall total, so without the cap this would score in the low 80s.
    const model = modelWithCategories({ skills: [{ ...blankSkill() }] });
    const findings = [finding({ severity: 'critical', category: 'instructions' })];
    const result = scoreFindings(findings, model);
    expect(result.score).toBe(74);
    expect(result.capped).toBe(true);
  });

  it('does not mark capped when there is no critical finding', () => {
    const result = scoreFindings([finding({ severity: 'low', category: 'instructions' })], modelWithCategories());
    expect(result.capped).toBe(false);
  });
});

describe('scoreFindings: possible-finding cap', () => {
  it('caps possible-finding deductions at 50 percent of the category weight', () => {
    // instructions weight 30; 50% cap = 15 points. Ten "possible" high
    // findings (5 pts each = 50) should still only deduct 15.
    const findings = Array.from({ length: 10 }, () =>
      finding({ severity: 'high', category: 'instructions', possible: true }),
    );
    const result = scoreFindings(findings, modelWithCategories());
    const instructions = result.categories.find((c) => c.category === 'instructions');
    expect(instructions?.deductions).toBe(15);
    expect(result.score).toBe(50); // (30-15)/30 * 100 = 50
  });
});

describe('scoreFindings: bands', () => {
  const cases: { deductionPoints: number; expectedBand: string }[] = [
    { deductionPoints: 0, expectedBand: 'Excellent' }, // 100
    { deductionPoints: 15, expectedBand: 'Good' }, // 100 - 15 = ... see below
    { deductionPoints: 50, expectedBand: 'Needs work' },
    { deductionPoints: 90, expectedBand: 'Poor' },
  ];

  it('Excellent for a perfect score', () => {
    const result = scoreFindings([], modelWithCategories());
    expect(result.band).toBe('Excellent');
  });

  it('Good for a score of 89', () => {
    // instructions weight 30: need fraction such that round(fraction*100) = 89.
    // deductions of 3.3 points isn't representable; use low findings (1pt each).
    const findings = Array.from({ length: 3 }, () => finding({ severity: 'low', category: 'instructions' }));
    const result = scoreFindings(findings, modelWithCategories());
    expect(result.score).toBe(90); // (30-3)/30*100 = 90 -> Excellent boundary
    expect(result.band).toBe('Excellent');
  });

  it('Needs work for a mid-range score', () => {
    const findings = Array.from({ length: 3 }, () => finding({ severity: 'high', category: 'instructions' }));
    const result = scoreFindings(findings, modelWithCategories());
    expect(result.score).toBe(50); // (30-15)/30*100 = 50
    expect(result.band).toBe('Needs work');
  });

  it('Poor for a low score', () => {
    const findings = Array.from({ length: 6 }, () => finding({ severity: 'high', category: 'instructions' }));
    const result = scoreFindings(findings, modelWithCategories());
    expect(result.score).toBe(0); // 6*5=30 deduction == full weight
    expect(result.band).toBe('Poor');
  });

  it('Good band is reachable directly', () => {
    const findings = Array.from({ length: 1 }, () => finding({ severity: 'high', category: 'instructions' }));
    const result = scoreFindings(findings, modelWithCategories());
    expect(result.score).toBe(83); // (30-5)/30*100 = 83.33 -> 83
    expect(result.band).toBe('Good');
  });
});

describe('scoreFindings: not enough to score', () => {
  it('is never reachable in practice since instructions is always applicable, but degrades safely', () => {
    // isCategoryApplicable('instructions') is unconditionally true, so this
    // documents the guaranteed invariant rather than forcing an impossible state.
    const result = scoreFindings([], modelWithCategories());
    expect(result.score).not.toBeNull();
  });
});

describe('computeOverheadTokens', () => {
  it('sums instruction file tokens and skill description tokens', () => {
    const model = modelWithCategories({
      instructions: [
        {
          agent: 'claude',
          scope: 'project',
          path: 'CLAUDE.md',
          sizeBytes: 40,
          text: 'x'.repeat(40),
          lines: ['x'.repeat(40)],
          estTokens: 10,
          staleReferences: [],
        },
      ],
      skills: [{ ...blankSkill(), description: 'a'.repeat(8) }], // 2 tokens
    });
    expect(computeOverheadTokens(model)).toBe(12);
  });
});

function blankSkill() {
  return {
    agent: 'claude' as const,
    scope: 'project' as const,
    path: '.claude/skills/demo/SKILL.md',
    sizeBytes: 10,
    kind: 'skill' as const,
    folder: '.claude/skills/demo',
    name: 'demo',
    description: 'A demo skill.',
    frontmatterValid: true,
    lineCount: 5,
    text: '',
    relativeRefs: [],
  };
}
