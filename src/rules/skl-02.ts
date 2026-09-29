import { RULE_DEFAULTS } from '../core/defaults.js';
import type { Finding, Rule } from '../core/types.js';

export const skl02: Rule = {
  id: 'SKL-02',
  category: 'skills',
  title: 'Description too short or too long',
  agents: ['claude', 'copilot', 'cursor'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'The description decides triggering; too short is ambiguous and too long wastes tokens on every turn.',
  fix: 'Write one or two sentences that say what the skill does and when to use it.',
  run(ctx) {
    const { minChars, maxChars } = { ...RULE_DEFAULTS['SKL-02'], ...(ctx.config.thresholds['SKL-02'] ?? {}) };
    const findings: Finding[] = [];
    for (const skill of ctx.model.skills) {
      const description = skill.description;
      if (!description) continue; // SKL-01 already reports a missing/empty description
      const len = description.trim().length;
      if (len >= minChars && len <= maxChars) continue;
      const label = len < minChars ? 'too short' : 'too long';
      findings.push({
        ruleId: 'SKL-02',
        category: 'skills',
        severity: 'medium',
        agent: skill.agent,
        sharedWith: skill.sharedWith?.filter((a) => skl02.agents.includes(a)),
        file: skill.path,
        message: `Skill ${skill.name ?? skill.path} has a description of ${len} characters (${label})`,
        why: skl02.why,
        fix: skl02.fix,
      });
    }
    return findings;
  },
};
