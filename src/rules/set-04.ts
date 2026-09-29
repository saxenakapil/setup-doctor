import { EXACT_BROAD_BASH_PATTERNS } from './broad-bash-patterns.js';
import type { Finding, Rule } from '../core/types.js';

export const set04: Rule = {
  id: 'SET-04',
  category: 'settings',
  title: 'Overly broad deny rule blocks legitimate work',
  agents: ['claude', 'copilot'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'A deny rule this broad blocks legitimate commands along with risky ones, forcing constant manual overrides that erode the point of having permission rules at all.',
  fix: 'Narrow the deny rule to the specific risky commands you want to block, such as Bash(rm -rf:*), and allow the rest.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const permission of ctx.model.permissions) {
      if (permission.kind !== 'deny') continue;
      if (!EXACT_BROAD_BASH_PATTERNS.has(permission.rule)) continue;
      findings.push({
        ruleId: 'SET-04',
        category: 'settings',
        severity: 'medium',
        agent: permission.agent,
        sharedWith: permission.sharedWith?.filter((a) => set04.agents.includes(a)),
        file: permission.sourcePath,
        message: `Deny rule ${permission.rule} in ${permission.sourcePath} blocks all Bash commands, which likely blocks legitimate work too`,
        why: set04.why,
        fix: set04.fix,
      });
    }
    return findings;
  },
};
