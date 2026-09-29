import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeOutputFile } from '../../src/core/output.js';

describe('writeOutputFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-output-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a new file and creates the directory if needed', async () => {
    const nested = join(dir, 'nested');
    const result = await writeOutputFile(nested, 'report.html', '<html></html>', false);
    expect(result.ok).toBe(true);
    expect(readFileSync(join(nested, 'report.html'), 'utf8')).toBe('<html></html>');
  });

  it('refuses to overwrite an existing file without --yes', async () => {
    await writeOutputFile(dir, 'report.html', 'first', false);
    const result = await writeOutputFile(dir, 'report.html', 'second', false);
    expect(result.ok).toBe(false);
    expect(readFileSync(join(dir, 'report.html'), 'utf8')).toBe('first');
  });

  it('overwrites when yes is true', async () => {
    await writeOutputFile(dir, 'report.html', 'first', false);
    const result = await writeOutputFile(dir, 'report.html', 'second', true);
    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, 'report.html'), 'utf8')).toBe('second');
  });
});
