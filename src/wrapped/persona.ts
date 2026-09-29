// Persona labels. See docs/scope.md section 11.5. First match wins.

import type { WrappedMetrics } from './metrics.js';

export type PersonaLabel = 'Night Owl' | 'Marathoner' | 'Cache Master' | 'Streak Keeper' | 'Steady Builder';

export interface Persona {
  label: PersonaLabel;
  line: string;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export function classifyPersona(metrics: WrappedMetrics): Persona {
  if (metrics.nightOwlUserRecordFraction >= 0.4) {
    return { label: 'Night Owl', line: 'Most of your messages land after dark.' };
  }
  if (metrics.longestSessionMs > FOUR_HOURS_MS) {
    return { label: 'Marathoner', line: 'Your longest session ran past 4 hours.' };
  }
  if (metrics.cacheHitRate > 0.9) {
    return { label: 'Cache Master', line: 'Your context cache did the heavy lifting.' };
  }
  if (metrics.longestStreakDays >= 14) {
    return { label: 'Streak Keeper', line: 'You showed up day after day.' };
  }
  return { label: 'Steady Builder', line: 'Steady, consistent use.' };
}
