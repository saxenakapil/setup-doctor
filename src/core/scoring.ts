// Scoring algorithm. Implemented exactly as docs/scope.md section 10.4.

import { CATEGORY_WEIGHTS, CRITICAL_SCORE_CAP, POSSIBLE_FINDING_CAP_FRACTION, SCORE_BANDS, SEVERITY_POINTS } from './defaults.js';
import { estimateTokens } from './tokens.js';
import type { Category, Finding, NormalizedModel } from './types.js';

export interface CategoryScore {
  category: Category;
  weight: number;
  applicable: boolean;
  deductions: number;
  fraction: number;
}

export interface ScoreResult {
  score: number | null;
  band: string | null;
  capped: boolean;
  categories: CategoryScore[];
}

function isCategoryApplicable(category: Category, model: NormalizedModel): boolean {
  switch (category) {
    case 'instructions':
      return true;
    case 'skills':
      return model.skills.length > 0;
    case 'mcp':
      return model.mcpServers.length > 0;
    case 'plugins':
      return model.plugins.length > 0;
    case 'settings':
      return model.hooks.length > 0 || model.permissions.length > 0;
    case 'freshness':
      return model.instructions.length > 0 || model.skills.length > 0;
  }
}

/**
 * Scores findings against the normalized model. `findings` should be the
 * post-suppression, kept findings (suppressed findings never affect score).
 */
export function scoreFindings(findings: Finding[], model: NormalizedModel): ScoreResult {
  const categories: CategoryScore[] = [];
  let anyCritical = false;

  for (const category of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const weight = CATEGORY_WEIGHTS[category];
    const applicable = isCategoryApplicable(category, model);
    const categoryFindings = findings.filter((f) => f.category === category);

    let deductions = 0;
    let possibleDeductions = 0;
    for (const f of categoryFindings) {
      if (f.severity === 'critical') anyCritical = true;
      const points = SEVERITY_POINTS[f.severity];
      if (f.possible) possibleDeductions += points;
      else deductions += points;
    }
    const possibleCap = weight * POSSIBLE_FINDING_CAP_FRACTION;
    deductions += Math.min(possibleDeductions, possibleCap);

    const fraction = applicable ? Math.max(0, weight - deductions) / weight : 0;
    categories.push({ category, weight, applicable, deductions, fraction });
  }

  const applicableCategories = categories.filter((c) => c.applicable);
  if (applicableCategories.length === 0) {
    return { score: null, band: null, capped: false, categories };
  }

  const totalApplicableWeight = applicableCategories.reduce((sum, c) => sum + c.weight, 0);
  let total = 0;
  for (const c of applicableCategories) {
    const effectiveWeight = (c.weight * 100) / totalApplicableWeight;
    total += c.fraction * effectiveWeight;
  }

  let score = Math.round(total);
  let capped = false;
  if (anyCritical && score > CRITICAL_SCORE_CAP) {
    score = CRITICAL_SCORE_CAP;
    capped = true;
  }

  const band = SCORE_BANDS.find((b) => score >= b.min && score <= b.max)?.label ?? null;
  return { score, band, capped, categories };
}

/**
 * alwaysLoadedTokens (docs/scope.md section 10.5): every instruction file
 * plus every skill description.
 */
export function computeOverheadTokens(model: NormalizedModel): number {
  let total = 0;
  for (const file of model.instructions) total += file.estTokens;
  for (const skill of model.skills) total += estimateTokens(skill.description ?? '');
  return total;
}
