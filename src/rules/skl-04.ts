import { RULE_DEFAULTS } from '../core/defaults.js';
import type { Finding, Rule } from '../core/types.js';

export const skl04: Rule = {
  id: 'SKL-04',
  category: 'skills',
  title: 'Skill file too long',
  agents: ['claude', 'copilot', 'cursor'],
  heuristic: false,
  severityLabel: 'low',
  why: 'Long skills load a lot of text each time they trigger.',
  fix: 'Keep SKILL.md short and move detail into reference files that load only when needed.',
  run(ctx) {
    const { maxLines } = { ...RULE_DEFAULTS['SKL-04'], ...(ctx.config.thresholds['SKL-04'] ?? {}) };
    const findings: Finding[] = [];
    for (const skill of ctx.model.skills) {
      if (skill.lineCount <= maxLines) continue;
      findings.push({
        ruleId: 'SKL-04',
        category: 'skills',
        severity: 'low',
        agent: skill.agent,
        sharedWith: skill.sharedWith?.filter((a) => skl04.agents.includes(a)),
        file: skill.path,
        message: `${skill.path} has ${skill.lineCount} lines (limit ${maxLines})`,
        why: skl04.why,
        fix: skl04.fix,
      });
    }
    return findings;
  },
};
