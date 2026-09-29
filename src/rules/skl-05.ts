import type { Finding, Rule } from '../core/types.js';

export const skl05: Rule = {
  id: 'SKL-05',
  category: 'skills',
  title: 'Broken links to bundled files',
  agents: ['claude', 'copilot'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'A skill that points to missing files fails when it triggers.',
  fix: 'Add the missing file or correct the link.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const skill of ctx.model.skills) {
      for (const ref of skill.relativeRefs) {
        if (ref.exists) continue;
        findings.push({
          ruleId: 'SKL-05',
          category: 'skills',
          severity: 'medium',
          agent: skill.agent,
          sharedWith: skill.sharedWith?.filter((a) => skl05.agents.includes(a)),
          file: skill.path,
          line: ref.line,
          message: `${skill.path}:${ref.line} links to ${ref.target} which does not exist`,
          why: skl05.why,
          fix: skl05.fix,
        });
      }
    }
    return findings;
  },
};
