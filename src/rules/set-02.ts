import type { Finding, Rule } from '../core/types.js';

export const set02: Rule = {
  id: 'SET-02',
  category: 'settings',
  title: 'Hook points to a missing script',
  agents: ['claude', 'copilot'],
  heuristic: false,
  severityLabel: 'high',
  why: 'A broken hook silently fails or blocks actions.',
  fix: 'Correct the path, make the script executable, or remove the hook.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const hook of ctx.model.hooks) {
      const check = hook.scriptCheck;
      if (!check) continue;
      if (check.exists && check.executable) continue;
      findings.push({
        ruleId: 'SET-02',
        category: 'settings',
        severity: 'high',
        agent: hook.agent,
        sharedWith: hook.sharedWith?.filter((a) => set02.agents.includes(a)),
        file: hook.sourcePath,
        message: `Hook ${hook.event} in ${hook.sourcePath} points to ${check.resolvedPath} which is missing or not executable`,
        why: set02.why,
        fix: set02.fix,
      });
    }
    return findings;
  },
};
