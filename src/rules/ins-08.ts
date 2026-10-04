import { findSecretLikeValues } from '../core/text.js';
import type { Finding, Rule } from '../core/types.js';

export const ins08: Rule = {
  id: 'INS-08',
  category: 'instructions',
  title: 'Secret-like string in an instruction file',
  agents: ['claude', 'codex', 'cursor', 'copilot', 'generic'],
  heuristic: false,
  severityLabel: 'critical',
  why: 'Instruction files are often committed and are sent to the model provider on every turn.',
  fix: 'Remove the value, rotate the credential, and read it from an environment variable instead.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.model.instructions) {
      file.lines.forEach((raw, idx) => {
        if (findSecretLikeValues(raw).length === 0) return;
        findings.push({
          ruleId: 'INS-08',
          category: 'instructions',
          severity: 'critical',
          agent: file.agent,
          sharedWith: file.sharedWith?.filter((a) => ins08.agents.includes(a)),
          file: file.path,
          line: idx + 1,
          message: `Secret-like value in ${file.path}:${idx + 1} ([REDACTED])`,
          why: ins08.why,
          fix: ins08.fix,
        });
      });
    }
    return findings;
  },
};
