import { describe, expect, it } from 'vitest';
import { applySuppressions, parseInlineSuppressions } from '../../src/core/suppress.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';
import type { Finding } from '../../src/core/types.js';

describe('parseInlineSuppressions', () => {
  it('parses a single rule id', () => {
    expect(parseInlineSuppressions('<!-- doctor-ignore INS-04 -->')).toEqual(new Set(['INS-04']));
  });

  it('parses multiple comma separated ids', () => {
    expect(parseInlineSuppressions('<!-- doctor-ignore INS-04, SKL-02 -->')).toEqual(
      new Set(['INS-04', 'SKL-02']),
    );
  });

  it('returns an empty set when absent', () => {
    expect(parseInlineSuppressions('No comment here.')).toEqual(new Set());
  });
});

function finding(overrides: Partial<Finding>): Finding {
  return {
    ruleId: 'INS-04',
    category: 'instructions',
    severity: 'medium',
    message: 'msg',
    why: 'why',
    fix: 'fix',
    ...overrides,
  };
}

describe('applySuppressions', () => {
  it('suppresses findings for a config-disabled rule', () => {
    const config = { ...DEFAULT_CONFIG, disabledRules: ['INS-04'] };
    const result = applySuppressions([finding({})], config, new Map());
    expect(result.kept).toEqual([]);
    expect(result.suppressed).toHaveLength(1);
  });

  it('suppresses findings inline-ignored in their file', () => {
    const inline = new Map([['CLAUDE.md', new Set(['INS-04'])]]);
    const result = applySuppressions([finding({ file: 'CLAUDE.md' })], DEFAULT_CONFIG, inline);
    expect(result.kept).toEqual([]);
    expect(result.suppressed).toHaveLength(1);
  });

  it('keeps findings that are not suppressed', () => {
    const result = applySuppressions([finding({ file: 'CLAUDE.md' })], DEFAULT_CONFIG, new Map());
    expect(result.kept).toHaveLength(1);
    expect(result.suppressed).toEqual([]);
  });
});
