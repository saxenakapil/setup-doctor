import type { Finding, Rule } from '../core/types.js';

const MAX_PER_FILE = 10;

export const ins06: Rule = {
  id: 'INS-06',
  category: 'instructions',
  title: 'Stale references',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'Stale references send the agent to files and commands that no longer exist.',
  fix: 'Update the reference to the current path or command, or remove it.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.model.instructions) {
      if (file.scope !== 'project') continue;
      const stale = file.staleReferences.filter((r) => !r.exists).slice(0, MAX_PER_FILE);
      for (const ref of stale) {
        findings.push({
          ruleId: 'INS-06',
          category: 'instructions',
          severity: 'medium',
          agent: file.agent,
          sharedWith: file.sharedWith,
          file: file.path,
          line: ref.line,
          message: `${file.path} mentions ${ref.target} which does not exist`,
          why: ins06.why,
          fix: ins06.fix,
        });
      }
    }
    return findings;
  },
};
