import type { Finding, Rule } from '../core/types.js';

const EXACT_DANGEROUS = new Set(['Bash', 'Bash(*)', 'Bash(:*)', '*']);
const DANGEROUS_PREFIX_RE = /^(rm|sudo|chmod 777|curl|wget)/;
const PIPE_TO_SHELL_RE = /\|\s*(sh|bash)\b/;

function isDangerous(rule: string): boolean {
  if (EXACT_DANGEROUS.has(rule)) return true;
  const m = /^Bash\((.*)\)$/.exec(rule);
  if (!m) return false;
  const inner = (m[1] ?? '').trim();
  if (DANGEROUS_PREFIX_RE.test(inner)) return true;
  if (PIPE_TO_SHELL_RE.test(inner)) return true;
  return false;
}

export const set01: Rule = {
  id: 'SET-01',
  category: 'settings',
  title: 'Overly broad permission rule',
  agents: ['claude'],
  heuristic: false,
  severityLabel: 'high',
  why: 'Broad allow rules remove the safety prompt for actions that can delete files or run downloaded code.',
  fix: 'Replace it with narrow rules such as Bash(npm test:*), and keep dangerous commands behind a prompt.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const permission of ctx.model.permissions) {
      if (permission.kind !== 'allow') continue;
      if (!isDangerous(permission.rule)) continue;
      findings.push({
        ruleId: 'SET-01',
        category: 'settings',
        severity: 'high',
        agent: permission.agent,
        sharedWith: permission.sharedWith,
        file: permission.sourcePath,
        message: `Permission rule ${permission.rule} in ${permission.sourcePath} allows unrestricted or risky commands`,
        why: set01.why,
        fix: set01.fix,
      });
    }
    return findings;
  },
};
