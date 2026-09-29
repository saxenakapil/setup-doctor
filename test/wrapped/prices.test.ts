import { describe, expect, it } from 'vitest';
import { estimateCost, findPriceRow, PRICE_TABLE_AS_OF } from '../../src/wrapped/prices.js';

describe('findPriceRow', () => {
  it('matches sonnet-5 but not opus-5-5 for a sonnet model id', () => {
    const row = findPriceRow('claude-sonnet-5');
    expect(row?.pattern).toBe('sonnet-5');
  });

  it('matches opus-5-5 specifically, not the shorter opus-5 pattern', () => {
    const row = findPriceRow('claude-opus-5-5');
    expect(row?.pattern).toBe('opus-5-5');
  });

  it('matches opus-5 for a plain opus-5 model id', () => {
    const row = findPriceRow('claude-opus-5');
    expect(row?.pattern).toBe('opus-5');
  });

  it('returns null for an unknown model', () => {
    expect(findPriceRow('claude-4-legacy')).toBeNull();
  });
});

describe('estimateCost', () => {
  it('computes cost from input/output/cache tokens at the matched rate', () => {
    const usage = new Map([['claude-haiku-4-5', { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 }]]);
    const result = estimateCost(usage);
    // haiku-4-5: input 1, output 5, cacheRead 0.10x input, cacheWrite 1.25x input, per docs/scope.md 11.4.
    expect(result.totalUsd).toBeCloseTo(1 + 5 + 0.1 + 1.25, 6);
    expect(result.hasUnknownModel).toBe(false);
    expect(result.asOf).toBe(PRICE_TABLE_AS_OF);
  });

  it('marks an unknown model n/a without dropping its token count', () => {
    const usage = new Map([['some-future-model', { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 }]]);
    const result = estimateCost(usage);
    expect(result.totalUsd).toBeNull();
    expect(result.hasUnknownModel).toBe(true);
    expect(result.perModel[0]).toEqual({ model: 'some-future-model', tokens: 150, costUsd: null });
  });

  it('sums known models and still flags unknown ones alongside them', () => {
    const usage = new Map([
      ['claude-sonnet-5', { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }],
      ['mystery-model', { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }],
    ]);
    const result = estimateCost(usage);
    expect(result.totalUsd).toBeCloseTo(2, 6); // sonnet-5 input rate is $2/M
    expect(result.hasUnknownModel).toBe(true);
  });
});
