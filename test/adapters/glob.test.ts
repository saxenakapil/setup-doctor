import { describe, expect, it } from 'vitest';
import { matchesIgnore } from '../../src/adapters/glob.js';

describe('matchesIgnore', () => {
  it('matches a directory-prefix pattern against everything under it', () => {
    expect(matchesIgnore('test/fixtures/ins-08-trigger/CLAUDE.md', ['test/fixtures/**'])).toBe(true);
    expect(matchesIgnore('test/fixtures/foo/bar/baz.md', ['test/fixtures/**'])).toBe(true);
    expect(matchesIgnore('src/CLAUDE.md', ['test/fixtures/**'])).toBe(false);
  });

  it('does not match the bare directory itself without a trailing segment', () => {
    expect(matchesIgnore('test/fixtures', ['test/fixtures/**'])).toBe(false);
  });

  it('matches the bare directory itself once a trailing slash is appended (the isDir check pattern)', () => {
    expect(matchesIgnore('test/fixtures/', ['test/fixtures/**'])).toBe(true);
  });

  it('supports a trailing slash as shorthand for "everything under this directory"', () => {
    expect(matchesIgnore('vendor/lib/CLAUDE.md', ['vendor/'])).toBe(true);
    expect(matchesIgnore('vendor', ['vendor/'])).toBe(false);
  });

  it('matches * within a single path segment only', () => {
    expect(matchesIgnore('logs/debug.log', ['logs/*.log'])).toBe(true);
    expect(matchesIgnore('logs/sub/debug.log', ['logs/*.log'])).toBe(false);
  });

  it('matches ** across any number of segments, including zero, when leading', () => {
    expect(matchesIgnore('debug.tmp', ['**/*.tmp'])).toBe(true);
    expect(matchesIgnore('a/b/c/debug.tmp', ['**/*.tmp'])).toBe(true);
  });

  it('is anchored: a slash-containing pattern only matches at that exact path', () => {
    expect(matchesIgnore('examples/fixtures/CLAUDE.md', ['fixtures/**'])).toBe(false);
  });

  it('escapes regex-special characters in literal segments', () => {
    expect(matchesIgnore('a+b/CLAUDE.md', ['a+b/**'])).toBe(true);
    expect(matchesIgnore('axb/CLAUDE.md', ['a+b/**'])).toBe(false);
  });

  it('returns false for an empty pattern list', () => {
    expect(matchesIgnore('anything', [])).toBe(false);
  });

  it('never throws on a malformed pattern', () => {
    expect(() => matchesIgnore('anything', ['[unterminated'])).not.toThrow();
  });
});
