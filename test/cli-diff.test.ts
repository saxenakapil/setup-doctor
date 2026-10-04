import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';

const FIXTURES = join(__dirname, 'fixtures', 'fix-mode');
const NO_HOME = join(__dirname, 'fixtures', 'fix-mode', 'nonexistent-home');

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) } };
}

describe('setup-doctor diff (end to end, real doctor JSON)', () => {
  let dir: string;
  let broken: string;
  let clean: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-diff-'));
    broken = join(dir, 'before.json');
    clean = join(dir, 'after.json');
    const a = capture();
    await main(['doctor', join(FIXTURES, 'project-broken-hook'), '--agent', 'claude', '--scope', 'project', '--format', 'json'], a.io, NO_HOME);
    writeFileSync(broken, a.out.join('\n'));
    const b = capture();
    await main(['doctor', join(FIXTURES, 'project-clean'), '--agent', 'claude', '--scope', 'project', '--format', 'json'], b.io, NO_HOME);
    writeFileSync(clean, b.out.join('\n'));
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('explains a score improvement between a broken and a clean setup', async () => {
    const c = capture();
    const code = await main(['diff', broken, clean], c.io);
    expect(code).toBe(0);
    const text = c.out.join('\n');
    expect(text).toMatch(/^Score \d+ -> \d+ \(\+\d+\)/);
    expect(text).toContain('resolved:');
  });

  it('exits 2 with a usage message when a file is missing', async () => {
    const c = capture();
    const code = await main(['diff', broken], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('Usage: setup-doctor diff');
  });

  it('exits 2 and names the file when it does not exist', async () => {
    const c = capture();
    const code = await main(['diff', join(dir, 'missing.json'), clean], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('Cannot read');
    expect(c.err.join('\n')).toContain('not found');
  });

  it('exits 2 for a file that is not a doctor JSON report', async () => {
    const notReport = join(dir, 'not-report.json');
    writeFileSync(notReport, JSON.stringify({ hello: 'world' }));
    const c = capture();
    const code = await main(['diff', notReport, clean], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('rulesVersion');
  });

  it('exits 2 for invalid JSON rather than crashing', async () => {
    const garbage = join(dir, 'garbage.json');
    writeFileSync(garbage, '{ not json');
    const c = capture();
    const code = await main(['diff', garbage, clean], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('not valid JSON');
  });
});
