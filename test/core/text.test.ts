import { describe, expect, it } from 'vitest';
import {
  dice,
  extractRelativeRefs,
  findSecretLikeValues,
  jaccard,
  normalizeLine,
  shannonEntropy,
  wordSet,
} from '../../src/core/text.js';

describe('normalizeLine', () => {
  it('lowercases, strips list markers and collapses whitespace', () => {
    expect(normalizeLine('- Always   run the   Tests.')).toBe('always run the tests.');
  });

  it('strips surrounding markdown emphasis', () => {
    expect(normalizeLine('**Be careful**')).toBe('be careful');
  });
});

describe('jaccard', () => {
  it('is 1.0 for identical sets', () => {
    expect(jaccard(wordSet('always run tests'), wordSet('always run tests'))).toBe(1);
  });

  it('is 0 for disjoint sets', () => {
    expect(jaccard(wordSet('foo bar'), wordSet('baz qux'))).toBe(0);
  });
});

describe('dice', () => {
  it('is 1.0 for identical normalized lines', () => {
    const a = normalizeLine('Always run the tests before committing.');
    expect(dice(a, a)).toBe(1);
  });

  it('is lower for dissimilar lines', () => {
    const a = normalizeLine('Always run the tests before committing.');
    const b = normalizeLine('Never commit secrets to the repository.');
    expect(dice(a, b)).toBeLessThan(0.5);
  });
});

describe('shannonEntropy', () => {
  it('is low for a repeated character', () => {
    expect(shannonEntropy('aaaaaaaaaaaaaaaa')).toBe(0);
  });

  it('is high for a random-looking string', () => {
    expect(shannonEntropy('aZ9kQ2mP7xR4vL1w')).toBeGreaterThan(3.5);
  });
});

describe('findSecretLikeValues', () => {
  it('triggers on a GitHub token pattern', () => {
    const matches = findSecretLikeValues('token: ghp_' + 'a'.repeat(36));
    expect(matches.length).toBeGreaterThan(0);
  });

  it('triggers on a high-entropy assignment', () => {
    const matches = findSecretLikeValues('API_KEY=aZ9kQ2mP7xR4vL1wT6bN3jH8');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('does not trigger on a placeholder assignment', () => {
    expect(findSecretLikeValues('API_KEY=your-api-key-here')).toEqual([]);
  });

  it('does not trigger on a hash with no assignment cue', () => {
    expect(findSecretLikeValues('Commit abcdef0123456789abcdef0123456789abcdef01 fixed the bug.')).toEqual([]);
  });
});

describe('extractRelativeRefs', () => {
  it('finds a markdown link to a relative path', () => {
    const refs = extractRelativeRefs('See [schema](references/schema.md) for details.');
    expect(refs).toEqual([{ target: 'references/schema.md', line: 1 }]);
  });

  it('finds an inline-code relative path', () => {
    const refs = extractRelativeRefs('Edit `src/legacy/handler.ts` next.');
    expect(refs).toEqual([{ target: 'src/legacy/handler.ts', line: 1 }]);
  });

  it('ignores URLs and anchors', () => {
    const refs = extractRelativeRefs('See [docs](https://example.com/x) and [top](#top).');
    expect(refs).toEqual([]);
  });
});
