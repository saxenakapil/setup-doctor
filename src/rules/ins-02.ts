import { RULE_DEFAULTS } from '../core/defaults.js';
import type { Finding, Rule } from '../core/types.js';

interface Thresholds {
  warnTokens: number;
  highTokens: number;
}

function thresholdsFor(configThresholds: Record<string, Record<string, number>>): Thresholds {
  const override = configThresholds['INS-02'] ?? {};
  return { ...RULE_DEFAULTS['INS-02'], ...override };
}

export const ins02: Rule = {
  id: 'INS-02',
  category: 'instructions',
  title: 'Instruction file too large',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  severityLabel: 'medium / high',
  why: 'Instruction files load on every turn, so size is a recurring cost and dilutes the important rules.',
  fix: 'Move rarely needed sections into skill files or docs the agent reads on demand. Keep the always-loaded file short.',
  run(ctx) {
    const thresholds = thresholdsFor(ctx.config.thresholds);
    const findings: Finding[] = [];
    for (const file of ctx.model.instructions) {
      if (file.estTokens < thresholds.warnTokens) continue;
      const isHigh = file.estTokens >= thresholds.highTokens;
      const severity = isHigh ? 'high' : 'medium';
      const limit = isHigh ? thresholds.highTokens : thresholds.warnTokens;
      findings.push({
        ruleId: 'INS-02',
        category: 'instructions',
        severity,
        agent: file.agent,
        file: file.path,
        message: `${file.path} is about ${file.estTokens} tokens (limit ${limit})`,
        why: ins02.why,
        fix: ins02.fix,
        tokensSaved: file.estTokens - thresholds.warnTokens,
      });
    }
    return findings;
  },
};
