import type { Finding, Rule } from '../core/types.js';

// Matched anywhere in the command (not just the first token), the same way
// SET-01's own PIPE_TO_SHELL_RE checks for `| sh`/`| bash` anywhere in a
// compound command, since a hook command routinely chains steps with
// `&&`/`;`/`|`.
const NETWORK_TOOL_RE = /\b(curl|wget|nc|ncat|ssh|scp|rsync|telnet)\b/;

export const set03: Rule = {
  id: 'SET-03',
  category: 'settings',
  title: 'Hook shells out to a network tool',
  agents: ['claude', 'copilot'],
  heuristic: false,
  severityLabel: 'high',
  why: 'A hook that reaches the network can exfiltrate data or fetch and run remote code, with no prompt to catch it.',
  fix: 'Remove the network call from the hook, or replace it with a reviewed script you control and audit regularly.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const hook of ctx.model.hooks) {
      const match = NETWORK_TOOL_RE.exec(hook.command);
      if (!match) continue;
      findings.push({
        ruleId: 'SET-03',
        category: 'settings',
        severity: 'high',
        agent: hook.agent,
        sharedWith: hook.sharedWith?.filter((a) => set03.agents.includes(a)),
        file: hook.sourcePath,
        message: `Hook ${hook.event} in ${hook.sourcePath} shells out to a network tool (${match[1]})`,
        why: set03.why,
        fix: set03.fix,
      });
    }
    return findings;
  },
};
