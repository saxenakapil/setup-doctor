import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { VERSION } from '../src/version.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) } };
}

describe('cli scaffold', () => {
  it('prints the version', async () => {
    const c = capture();
    expect(await main(['--version'], c.io)).toBe(0);
    expect(c.out.join('\n')).toBe(VERSION);
  });

  it('prints help', async () => {
    const c = capture();
    expect(await main(['--help'], c.io)).toBe(0);
    expect(c.out.join('\n')).toContain('Usage:');
  });

  it('exits 2 on an unknown option', async () => {
    const c = capture();
    expect(await main(['--nope'], c.io)).toBe(2);
  });

  it('exits 2 on an unknown command', async () => {
    const c = capture();
    expect(await main(['frobnicate'], c.io)).toBe(2);
  });

  it('exits 4 for commands not implemented yet', async () => {
    const c = capture();
    expect(await main(['doctor'], c.io)).toBe(4);
    expect(c.err.join('\n')).toContain('not implemented yet');
  });
});
