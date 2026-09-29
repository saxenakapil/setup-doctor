import type { Finding, Rule } from '../core/types.js';

export const skl01: Rule = {
  id: 'SKL-01',
  category: 'skills',
  title: 'Invalid or missing frontmatter',
  agents: ['claude', 'copilot', 'cursor'],
  heuristic: false,
  severityLabel: 'high',
  why: 'Without a valid name and description the agent cannot decide when to use the skill.',
  fix: 'Add frontmatter with a name and a description that says when to use the skill.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const skill of ctx.model.skills) {
      if (!skill.frontmatterValid) {
        findings.push({
          ruleId: 'SKL-01',
          category: 'skills',
          severity: 'high',
          agent: skill.agent,
          sharedWith: skill.sharedWith?.filter((a) => skl01.agents.includes(a)),
          file: skill.path,
          message: `${skill.path}: ${skill.frontmatterError}`,
          why: skl01.why,
          fix: skl01.fix,
        });
      }
    }
    return findings;
  },
};
