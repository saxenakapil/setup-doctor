import { RULE_DEFAULTS } from '../core/defaults.js';
import { jaccard, wordSet } from '../core/text.js';
import type { Finding, Rule, Skill } from '../core/types.js';

function overlapFinding(a: Skill, b: Skill): Finding {
  return {
    ruleId: 'SKL-03',
    category: 'skills',
    severity: 'medium',
    agent: a.agent,
    sharedWith: a.sharedWith,
    file: a.path,
    message: `Skills ${a.name ?? a.path} and ${b.name ?? b.path} have overlapping descriptions`,
    why: 'Overlapping triggers make the agent pick the wrong skill or load both.',
    fix: 'Merge the skills or sharpen each description so they trigger on different requests.',
  };
}

export const skl03: Rule = {
  id: 'SKL-03',
  category: 'skills',
  title: 'Overlapping skills',
  agents: ['claude'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'Overlapping triggers make the agent pick the wrong skill or load both.',
  fix: 'Merge the skills or sharpen each description so they trigger on different requests.',
  run(ctx) {
    const { jaccardThreshold } = { ...RULE_DEFAULTS['SKL-03'], ...(ctx.config.thresholds['SKL-03'] ?? {}) };
    const findings: Finding[] = [];
    const skills = ctx.model.skills.filter((s) => s.description);

    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const a = skills[i] as Skill;
        const b = skills[j] as Skill;
        if (a.agent !== b.agent) continue;

        if (a.name && a.name === b.name) {
          const isOverride = a.scope !== b.scope; // project overrides global by design
          if (!isOverride) findings.push(overlapFinding(a, b));
          continue;
        }

        const wa = wordSet(a.description as string);
        const wb = wordSet(b.description as string);
        if (wa.size >= 4 && wb.size >= 4 && jaccard(wa, wb) >= jaccardThreshold) {
          findings.push(overlapFinding(a, b));
        }
      }
    }

    return findings;
  },
};
