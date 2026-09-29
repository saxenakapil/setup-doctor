import { describe, expect, it } from 'vitest';
import { applyLineRemoval, renderDeletionDiff, renderGeneralDiff } from '../../src/core/diff.js';

describe('applyLineRemoval', () => {
  it('removes the given 1-indexed lines and keeps the rest in order', () => {
    const text = 'a\nb\nc\nd\ne';
    expect(applyLineRemoval(text, [2, 4])).toBe('a\nc\ne');
  });

  it('removing nothing returns the text unchanged', () => {
    const text = 'a\nb\nc';
    expect(applyLineRemoval(text, [])).toBe(text);
  });

  it('removing every line returns an empty string', () => {
    expect(applyLineRemoval('a\nb', [1, 2])).toBe('');
  });
});

describe('renderDeletionDiff', () => {
  it('produces a unified diff with the removed line marked and surrounding context', () => {
    const text = ['line1', 'line2', 'DUPLICATE', 'line4', 'line5'].join('\n');
    const diff = renderDeletionDiff('CLAUDE.md', text, [3]);
    expect(diff).toContain('--- a/CLAUDE.md');
    expect(diff).toContain('+++ b/CLAUDE.md');
    expect(diff).toContain('-DUPLICATE');
    expect(diff).toContain(' line1');
    expect(diff).toContain(' line5');
    expect(diff).toMatch(/@@ -1,5 \+1,4 @@/);
  });

  it('the reconstructed new text (context lines minus removed) matches applyLineRemoval', () => {
    const text = ['a', 'b', 'DUP1', 'c', 'd', 'e', 'f', 'g', 'h', 'DUP2', 'i'].join('\n');
    const removed = [3, 10];
    const diff = renderDeletionDiff('file.md', text, removed);
    const keptFromDiff = diff
      .split('\n')
      .filter((l) => l.startsWith(' '))
      .map((l) => l.slice(1));
    const expectedNew = applyLineRemoval(text, removed).split('\n');
    // Every kept context line in the diff must actually survive in the real new text.
    for (const line of keptFromDiff) {
      expect(expectedNew).toContain(line);
    }
    expect(diff).not.toContain('-a');
    expect(diff).toContain('-DUP1');
    expect(diff).toContain('-DUP2');
  });

  it('handles a removal at the very start of the file (no context before it)', () => {
    const text = ['DUP', 'a', 'b', 'c'].join('\n');
    const diff = renderDeletionDiff('f.md', text, [1]);
    expect(diff).toContain('-DUP');
    expect(diff).toMatch(/@@ -1,4 \+1,3 @@/);
  });

  it('handles a removal at the very end of the file (no context after it)', () => {
    const text = ['a', 'b', 'c', 'DUP'].join('\n');
    const diff = renderDeletionDiff('f.md', text, [4]);
    expect(diff).toContain('-DUP');
  });
});

describe('renderGeneralDiff', () => {
  it('renders a pure deletion the same way a line-removal fix would (no spurious add)', () => {
    const oldText = ['a', 'b', 'c'].join('\n');
    const newText = ['a', 'c'].join('\n');
    const diff = renderGeneralDiff('f.json', oldText, newText);
    const body = diff.split('\n').slice(3); // skip ---/+++/@@ header lines
    expect(diff).toContain('-b');
    expect(diff).toContain(' a');
    expect(diff).toContain(' c');
    expect(body.some((l) => l.startsWith('+'))).toBe(false);
  });

  it('renders a line that only gained/lost a trailing comma as one remove + one add, not a false full-file rewrite', () => {
    const oldText = ['{', '  "a": 1,', '  "b": 2', '}'].join('\n');
    const newText = ['{', '  "a": 1', '}'].join('\n');
    const diff = renderGeneralDiff('f.json', oldText, newText);
    expect(diff).toContain('-  "a": 1,');
    expect(diff).toContain('+  "a": 1');
    expect(diff).toContain('-  "b": 2');
    expect(diff).toContain(' {');
    expect(diff).toContain(' }');
  });

  it('identical text produces no +/- lines', () => {
    const text = 'a\nb\nc';
    const diff = renderGeneralDiff('f.txt', text, text);
    const body = diff.split('\n').slice(3); // skip ---/+++/@@ header lines
    expect(body.every((l) => l.startsWith(' '))).toBe(true);
  });
});
