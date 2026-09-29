import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { VERSION } from '../src/version.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) } };
}

describe('cli basics', () => {
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

  it('exits 4 for commands not implemented yet', async () => {
    const c = capture();
    expect(await main(['wrapped'], c.io)).toBe(4);
    expect(c.err.join('\n')).toContain('not implemented yet');
  });

  it('exits 2 on an unknown --format value', async () => {
    const c = capture();
    expect(await main(['doctor', '--format', 'yaml'], c.io)).toBe(2);
  });

  it('exits 2 on an unknown --agent value', async () => {
    const c = capture();
    expect(await main(['doctor', '--agent', 'copilot'], c.io)).toBe(2);
  });

  it('exits 2 on an unknown --scope value', async () => {
    const c = capture();
    expect(await main(['doctor', '--scope', 'nowhere'], c.io)).toBe(2);
  });

  it('exits 2 on an unknown --theme value', async () => {
    const c = capture();
    expect(await main(['doctor', '--theme', 'neon'], c.io)).toBe(2);
  });

  it('exits 2 on an unknown --min-severity value', async () => {
    const c = capture();
    expect(await main(['doctor', '--min-severity', 'urgent'], c.io)).toBe(2);
  });
});

describe('cli doctor (deterministic fixture home and project)', () => {
  let homeDir: string;
  let emptyProject: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'setup-doctor-home-'));
    emptyProject = mkdtempSync(join(tmpdir(), 'setup-doctor-project-'));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(emptyProject, { recursive: true, force: true });
  });

  it('prints "Nothing to check" and exits 0 when nothing is detected', async () => {
    const c = capture();
    const code = await main(['doctor', emptyProject], c.io, homeDir);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('Nothing to check');
  });

  it('a bare path with no command word runs doctor', async () => {
    const c = capture();
    const code = await main([emptyProject], c.io, homeDir);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('Nothing to check');
  });

  it('prints a scored JSON report with no findings for a clean project', async () => {
    writeFileSync(join(emptyProject, 'CLAUDE.md'), 'Run npm test before committing.\n');
    const c = capture();
    const code = await main([emptyProject, '--format', 'json'], c.io, homeDir);
    expect(code).toBe(0);
    const report = JSON.parse(c.out.join('\n'));
    expect(report.schemaVersion).toBe(1);
    expect(report.toolVersion).toBe(VERSION);
    expect(report.agentsDetected).toEqual(['claude']);
    expect(report.score).toBe(100);
    expect(report.band).toBe('Excellent');
    expect(report.findings).toEqual([]);
    expect(report.suppressed).toEqual([]);
    expect(Array.isArray(report.skipped)).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it('prints a terminal report by default', async () => {
    writeFileSync(join(emptyProject, 'CLAUDE.md'), 'Run npm test before committing.\n');
    const c = capture();
    const code = await main([emptyProject], c.io, homeDir);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('Setup Doctor  score 100/100  (Excellent)');
  });

  it('--ci --fail-under exits 1 when the score is below the threshold', async () => {
    writeFileSync(join(emptyProject, 'CLAUDE.md'), 'API_KEY=aZ9kQ2mP7xR4vL1wT6bN3jH8\n');
    const c = capture();
    const code = await main([emptyProject, '--ci', '--fail-under', '90'], c.io, homeDir);
    expect(code).toBe(1);
  });

  it('--ci --fail-under exits 0 when the score meets the threshold', async () => {
    writeFileSync(join(emptyProject, 'CLAUDE.md'), 'Run npm test before committing.\n');
    const c = capture();
    const code = await main([emptyProject, '--ci', '--fail-under', '90'], c.io, homeDir);
    expect(code).toBe(0);
  });

  it('--format html writes a self-contained report file and exits 0', async () => {
    writeFileSync(join(emptyProject, 'CLAUDE.md'), 'API_KEY=aZ9kQ2mP7xR4vL1wT6bN3jH8\n');
    const outDir = mkdtempSync(join(tmpdir(), 'setup-doctor-out-'));
    try {
      const c = capture();
      const code = await main([emptyProject, '--format', 'html', '--theme', 'technical', '--out', outDir], c.io, homeDir);
      expect(code).toBe(0);
      const htmlPath = join(outDir, 'setup-doctor-report.html');
      expect(existsSync(htmlPath)).toBe(true);
      const html = readFileSync(htmlPath, 'utf8');
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('[REDACTED]');
      expect(html).not.toContain('aZ9kQ2mP7xR4vL1wT6bN3jH8');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing output file without --yes, and succeeds with --yes', async () => {
    writeFileSync(join(emptyProject, 'CLAUDE.md'), 'Run npm test before committing.\n');
    const outDir = mkdtempSync(join(tmpdir(), 'setup-doctor-out-'));
    try {
      const first = capture();
      expect(await main([emptyProject, '--format', 'html', '--out', outDir], first.io, homeDir)).toBe(0);

      const second = capture();
      expect(await main([emptyProject, '--format', 'html', '--out', outDir], second.io, homeDir)).toBe(2);
      expect(second.err.join('\n')).toContain('--yes');

      const third = capture();
      expect(await main([emptyProject, '--format', 'html', '--out', outDir, '--yes'], third.io, homeDir)).toBe(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('--min-severity hides low findings from the terminal report without changing the score', async () => {
    writeFileSync(
      join(emptyProject, 'CLAUDE.md'),
      'Write clean code.\nRun npm test before committing.\n',
    );
    const c = capture();
    const code = await main([emptyProject, '--min-severity', 'high'], c.io, homeDir);
    expect(code).toBe(0);
    const text = c.out.join('\n');
    expect(text).not.toContain('INS-05');
  });
});

describe('cli badge (deterministic fixture home and project)', () => {
  let homeDir: string;
  let project: string;
  let outDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'setup-doctor-home-'));
    project = mkdtempSync(join(tmpdir(), 'setup-doctor-project-'));
    outDir = mkdtempSync(join(tmpdir(), 'setup-doctor-out-'));
    writeFileSync(join(project, 'CLAUDE.md'), 'Run npm test before committing.\n');
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  });

  it('writes a badge SVG and prints the markdown snippet', async () => {
    const c = capture();
    const code = await main(['badge', project, '--out', outDir], c.io, homeDir);
    expect(code).toBe(0);
    const svgPath = join(outDir, 'setup-doctor-badge.svg');
    expect(existsSync(svgPath)).toBe(true);
    expect(readFileSync(svgPath, 'utf8')).toContain('<svg');
    expect(c.out.join('\n')).toContain('https://img.shields.io/badge/setup%20doctor-100%20Excellent-brightgreen');
  });

  it('--endpoint also writes the shields.io endpoint JSON', async () => {
    const c = capture();
    const code = await main(['badge', project, '--out', outDir, '--endpoint'], c.io, homeDir);
    expect(code).toBe(0);
    const jsonPath = join(outDir, 'setup-doctor-badge.json');
    expect(existsSync(jsonPath)).toBe(true);
    const endpoint = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(endpoint).toEqual({ schemaVersion: 1, label: 'setup doctor', message: '100 Excellent', color: 'brightgreen' });
  });
});
