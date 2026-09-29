import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../../src/core/tokens.js';

describe('estimateTokens', () => {
  it('rounds up characters / 4', () => {
    expect(estimateTokens('a'.repeat(24000))).toBe(6000);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('')).toBe(0);
  });
});
