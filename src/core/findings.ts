import type { Severity } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function filterByMinSeverity<T extends { severity: Severity }>(items: T[], min: Severity): T[] {
  const minRank = SEVERITY_RANK[min];
  return items.filter((f) => SEVERITY_RANK[f.severity] >= minRank);
}
