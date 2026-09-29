import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigParseError, loadConfigFile, mergeConfig } from '../../src/core/config.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';

describe('loadConfigFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns raw: null when no config file exists', async () => {
    const result = await loadConfigFile(dir);
    expect(result.raw).toBeNull();
  });

  it('parses a valid config file', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ theme: 'technical', disabledRules: ['INS-04'] }));
    const result = await loadConfigFile(dir);
    expect(result.raw).toMatchObject({ theme: 'technical', disabledRules: ['INS-04'] });
    expect(result.warnings).toEqual([]);
  });

  it('warns on unknown keys but still returns them ignored', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ bogus: true }));
    const result = await loadConfigFile(dir);
    expect(result.warnings.length).toBe(1);
  });

  it('warns and drops an unrecognized value for a known key, keeping the rest of the file', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ theme: 'neon', disabledRules: ['INS-04'] }));
    const result = await loadConfigFile(dir);
    expect(result.warnings).toEqual([`Invalid value "neon" for config key "theme" in ${join(dir, '.setupdoctorrc')} is ignored.`]);
    expect(result.raw).toEqual({ disabledRules: ['INS-04'] });
  });

  it('accepts "auto" as a valid agent value', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ agent: 'auto' }));
    const result = await loadConfigFile(dir);
    expect(result.warnings).toEqual([]);
    expect(result.raw).toMatchObject({ agent: 'auto' });
  });

  it('throws ConfigParseError on invalid JSON', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), '{ not json');
    await expect(loadConfigFile(dir)).rejects.toThrow(ConfigParseError);
  });

  it('parses a valid ignore array', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ ignore: ['test/fixtures/**', 'vendor/'] }));
    const result = await loadConfigFile(dir);
    expect(result.raw).toEqual({ ignore: ['test/fixtures/**', 'vendor/'] });
    expect(result.warnings).toEqual([]);
  });

  it('warns and drops a non-array ignore value', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ ignore: 'test/fixtures/**' }));
    const result = await loadConfigFile(dir);
    expect(result.raw).toEqual({});
    expect(result.warnings[0]).toContain('ignore');
  });

  it('warns and drops an ignore array with a non-string element', async () => {
    writeFileSync(join(dir, '.setupdoctorrc'), JSON.stringify({ ignore: ['ok', 5] }));
    const result = await loadConfigFile(dir);
    expect(result.raw).toEqual({});
    expect(result.warnings[0]).toContain('ignore');
  });
});

describe('mergeConfig', () => {
  it('falls back to defaults when nothing else is given', () => {
    expect(mergeConfig(null, {})).toEqual(DEFAULT_CONFIG);
  });

  it('CLI overrides win over the config file', () => {
    const merged = mergeConfig({ theme: 'technical' }, { theme: 'mix' });
    expect(merged.theme).toBe('mix');
  });

  it('config file wins over defaults', () => {
    const merged = mergeConfig({ theme: 'technical' }, {});
    expect(merged.theme).toBe('technical');
  });

  it('merges thresholds instead of replacing wholesale', () => {
    const merged = mergeConfig({ thresholds: { 'INS-02': { warnTokens: 1000, highTokens: 3000 } } }, {});
    expect(merged.thresholds['INS-02']).toEqual({ warnTokens: 1000, highTokens: 3000 });
  });

  it('CLI ignore overrides the config file ignore wholesale, same as disabledRules', () => {
    const merged = mergeConfig({ ignore: ['a/**'] }, { ignore: ['b/**'] });
    expect(merged.ignore).toEqual(['b/**']);
  });

  it('config file ignore wins over the empty default', () => {
    const merged = mergeConfig({ ignore: ['test/fixtures/**'] }, {});
    expect(merged.ignore).toEqual(['test/fixtures/**']);
  });
});
