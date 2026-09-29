// Inline and config-based finding suppression. See docs/scope.md section 7.

import type { Finding, SetupDoctorConfig } from './types.js';

const INLINE_RE = /<!--\s*doctor-ignore\s+([A-Za-z0-9,\s-]+?)\s*-->/g;

/** Rule IDs suppressed by `<!-- doctor-ignore ID[,ID...] -->` anywhere in a file's text. */
export function parseInlineSuppressions(text: string): Set<string> {
  const ids = new Set<string>();
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    for (const id of (m[1] ?? '').split(',')) {
      const trimmed = id.trim().toUpperCase();
      if (trimmed) ids.add(trimmed);
    }
  }
  return ids;
}

export interface SuppressResult {
  kept: Finding[];
  suppressed: Finding[];
}

/**
 * Splits findings into kept and suppressed. Suppressed findings do not
 * affect the score but are counted and listed separately (scope.md section 7).
 */
export function applySuppressions(
  findings: Finding[],
  config: SetupDoctorConfig,
  inlineByFile: Map<string, Set<string>>,
): SuppressResult {
  const kept: Finding[] = [];
  const suppressed: Finding[] = [];
  const disabled = new Set(config.disabledRules.map((r) => r.toUpperCase()));
  for (const f of findings) {
    const ruleId = f.ruleId.toUpperCase();
    const inline = f.file ? inlineByFile.get(f.file) : undefined;
    if (disabled.has(ruleId) || inline?.has(ruleId)) {
      suppressed.push(f);
    } else {
      kept.push(f);
    }
  }
  return { kept, suppressed };
}
