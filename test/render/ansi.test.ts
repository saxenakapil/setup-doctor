import { describe, expect, it } from 'vitest';
import { getAnsi, shouldUseColor } from '../../src/render/ansi.js';

describe('getAnsi', () => {
  it('returns plain passthrough functions when color is off', () => {
    const ansi = getAnsi(false);
    expect(ansi.red('x')).toBe('x');
    expect(ansi.bold('x')).toBe('x');
    expect(ansi.boldRed('x')).toBe('x');
  });

  it('wraps text in ANSI escape codes when color is on', () => {
    const ansi = getAnsi(true);
    expect(ansi.red('x')).toBe('\u001b[31mx\u001b[0m');
    expect(ansi.bold('x')).toBe('\u001b[1mx\u001b[0m');
    expect(ansi.boldRed('x')).toBe('\u001b[1;31mx\u001b[0m');
  });
});

describe('shouldUseColor', () => {
  const base = { noColorFlag: false, ciFlag: false, env: {}, isTTY: true };

  it('is on for a TTY with no overrides', () => {
    expect(shouldUseColor(base)).toBe(true);
  });

  it('is off for a non-TTY (e.g. piped output)', () => {
    expect(shouldUseColor({ ...base, isTTY: false })).toBe(false);
  });

  it('--no-color always wins, even on a TTY', () => {
    expect(shouldUseColor({ ...base, noColorFlag: true })).toBe(false);
  });

  it('--ci implies no color', () => {
    expect(shouldUseColor({ ...base, ciFlag: true })).toBe(false);
  });

  it('respects NO_COLOR being set to any non-empty value', () => {
    expect(shouldUseColor({ ...base, env: { NO_COLOR: '1' } })).toBe(false);
  });

  it('an empty NO_COLOR does not disable color (matches the NO_COLOR spec)', () => {
    expect(shouldUseColor({ ...base, env: { NO_COLOR: '' }, isTTY: true })).toBe(true);
  });

  it('FORCE_COLOR turns color on even for a non-TTY', () => {
    expect(shouldUseColor({ ...base, isTTY: false, env: { FORCE_COLOR: '1' } })).toBe(true);
  });

  it('--no-color still wins over FORCE_COLOR', () => {
    expect(shouldUseColor({ ...base, noColorFlag: true, env: { FORCE_COLOR: '1' } })).toBe(false);
  });
});
