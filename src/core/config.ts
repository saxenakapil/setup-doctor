// .setupdoctorrc loading and merging. Precedence: CLI flags, then the config
// file, then defaults. See docs/scope.md section 7.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from './defaults.js';
import type { SetupDoctorConfig } from './types.js';

const KNOWN_KEYS = new Set(['agent', 'scope', 'theme', 'minSeverity', 'disabledRules', 'thresholds']);

export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

export interface ConfigFileLoadResult {
  raw: Partial<SetupDoctorConfig> | null;
  warnings: string[];
}

/**
 * Reads and parses `.setupdoctorrc`. Returns `raw: null` when the file does
 * not exist. Throws ConfigParseError on invalid JSON (exit code 2 at the CLI).
 */
export async function loadConfigFile(projectRoot: string, configPath?: string): Promise<ConfigFileLoadResult> {
  const path = configPath ?? join(projectRoot, '.setupdoctorrc');
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { raw: null, warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ConfigParseError(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }

  const warnings: string[] = [];
  const raw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`Unknown config key "${key}" in ${path} is ignored.`);
  }
  return { raw: raw as Partial<SetupDoctorConfig>, warnings };
}

export function mergeConfig(
  fileConfig: Partial<SetupDoctorConfig> | null,
  cliOverrides: Partial<SetupDoctorConfig>,
): SetupDoctorConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(fileConfig ?? {}),
    ...cliOverrides,
    disabledRules: cliOverrides.disabledRules ?? fileConfig?.disabledRules ?? DEFAULT_CONFIG.disabledRules,
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(fileConfig?.thresholds ?? {}),
      ...(cliOverrides.thresholds ?? {}),
    },
  };
}
