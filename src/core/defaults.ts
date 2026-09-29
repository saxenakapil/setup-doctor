// Tunable numbers: thresholds, weights and limits. Never scatter these in rule code.
// See docs/scope.md sections 7 and 10.2, and docs/rules.md for the per-rule defaults.

import type { Category, Severity, SetupDoctorConfig } from './types.js';

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  instructions: 30,
  skills: 25,
  mcp: 15,
  plugins: 10,
  settings: 10,
  freshness: 10,
};

export const SEVERITY_POINTS: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};

export const SCORE_BANDS = [
  { min: 90, max: 100, label: 'Excellent' },
  { min: 75, max: 89, label: 'Good' },
  { min: 50, max: 74, label: 'Needs work' },
  { min: 0, max: 49, label: 'Poor' },
] as const;

export const CRITICAL_SCORE_CAP = 74;
export const POSSIBLE_FINDING_CAP_FRACTION = 0.5;

export const RULE_DEFAULTS = {
  'INS-02': { warnTokens: 2000, highTokens: 5000 },
  'INS-03': { diceThreshold: 0.9, minLineChars: 20 },
  'INS-04': { jaccardThreshold: 0.6 },
  'SKL-02': { minChars: 20, maxChars: 500 },
  'SKL-03': { jaccardThreshold: 0.6 },
  'SKL-04': { maxLines: 500 },
  'MCP-04': { maxServers: 8 },
} as const;

export const DEFAULT_CONFIG: SetupDoctorConfig = {
  agent: 'auto',
  scope: 'all',
  theme: 'playful',
  minSeverity: 'low',
  disabledRules: [],
  thresholds: {},
  ignore: [],
};

export const DISCOVERY_DEPTH_LIMIT = 5;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
// .setupdoctor-backup holds fix mode's pre-edit copies of files (section
// 14); it must never be descended into during discovery, or a backed-up
// CLAUDE.md re-triggers the exact finding fix mode just fixed on the next run.
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'vendor', '.setupdoctor-backup']);
export const SECRET_ENTROPY_THRESHOLD = 3.5;
