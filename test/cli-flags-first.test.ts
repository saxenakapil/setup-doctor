import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';

const BROKEN = join(__dirname, 'fixtures', 'fix-mode', 'project-broken-hook');
const NO_HOME = join(__dirname, 'fixtures', 'fix-mode', 'nonexistent-home');

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) } };
}

describe('flags before any command run the default audit', () => {
  it('--format json prints the JSON report', async () => {
    const c = capture();
    const code = await main(['--format', 'json', '--agent', 'claude', '--scope', 'project', BROKEN], c.io, NO_HOME);
    expect(code).toBe(0);
    expect(JSON.parse(c.out.join('\n')).schemaVersion).toBe(1);
  });

  it('--ci --fail-under exits 1 when the score is below the threshold', async () => {
    const c = capture();
    const code = await main(['--ci', '--fail-under', '99', '--agent', 'claude', '--scope', 'project', BROKEN], c.io, NO_HOME);
    expect(code).toBe(1);
  });

  it('--ci --fail-under exits 0 when the score meets the threshold', async () => {
    const c = capture();
    const code = await main(['--ci', '--fail-under', '50', '--agent', 'claude', '--scope', 'project', BROKEN], c.io, NO_HOME);
    expect(code).toBe(0);
  });

  it('--fix --dry-run previews without writing', async () => {
    const c = capture();
    const code = await main(['--fix', '--dry-run', '--agent', 'claude', '--scope', 'project', BROKEN], c.io, NO_HOME);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('Dry run: no files changed.');
  });
});

describe('unknown options and commands are still rejected', () => {
  it('an unknown leading flag exits 2 and names it', async () => {
    const c = capture();
    const code = await main(['--bogus'], c.io, NO_HOME);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('Unknown option: --bogus');
  });

});

describe('help text', () => {
  it('lists options grouped by command and has no internal references', async () => {
    const c = capture();
    const code = await main(['--help'], c.io, NO_HOME);
    expect(code).toBe(0);
    const text = c.out.join('\n');
    expect(text).toContain('Doctor options:');
    expect(text).toContain('Wrapped options:');
    expect(text).not.toContain('docs/scope.md');
    expect(text).not.toContain('Status:');
  });
});
