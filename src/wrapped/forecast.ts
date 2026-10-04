// Monthly cost projection for `wrapped`. Extrapolates the cost already spent
// in the period at its average daily rate, so idle days count as zero, which
// is what "at this rate" means. Null whenever the projection would be guesswork.

import { FORECAST_DAYS_PER_MONTH, FORECAST_MIN_ELAPSED_DAYS } from '../core/defaults.js';
import type { PeriodBounds } from './period.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from the period start to now (or to the period end, if that is earlier). Null for unbounded periods (`all`), which have no meaningful start. */
export function elapsedDaysInBounds(bounds: PeriodBounds, nowMs: number): number | null {
  if (!Number.isFinite(bounds.startMs) || !Number.isFinite(bounds.endMs)) return null;
  const endMs = Math.min(bounds.endMs, nowMs);
  return (endMs - bounds.startMs) / DAY_MS;
}

export function projectMonthlyCost(totalUsd: number | null, elapsedDays: number | null): number | null {
  if (totalUsd === null || elapsedDays === null) return null;
  if (elapsedDays < FORECAST_MIN_ELAPSED_DAYS) return null;
  // A period that already spans a month shows its real total; projecting it to a month would just repeat that number.
  if (elapsedDays >= FORECAST_DAYS_PER_MONTH) return null;
  return (totalUsd / elapsedDays) * FORECAST_DAYS_PER_MONTH;
}
