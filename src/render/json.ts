// JSON report shape. See docs/scope.md section 12.

import type { CategoryScore } from '../core/scoring.js';
import type { Agent, Finding, Skipped } from '../core/types.js';
import type { ThemeName } from './themes/index.js';

export interface JsonReport {
  schemaVersion: 1;
  toolVersion: string;
  rulesVersion: string;
  theme: ThemeName;
  agentsDetected: Agent[];
  score: number | null;
  band: string | null;
  capped: boolean;
  categories: CategoryScore[];
  overheadTokens: number;
  findings: Finding[];
  suppressed: Finding[];
  skipped: Skipped[];
  warnings: string[];
}

export function renderJsonReport(input: Omit<JsonReport, 'schemaVersion'>): JsonReport {
  return { schemaVersion: 1, ...input };
}
