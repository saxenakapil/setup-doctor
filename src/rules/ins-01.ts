import type { Finding, Rule } from '../core/types.js';

export const ins01: Rule = {
  id: 'INS-01',
  category: 'instructions',
  title: 'Instruction file present',
  agents: ['claude', 'codex', 'cursor', 'copilot'],
  heuristic: false,
  severityLabel: 'low',
  why: 'An instruction file is the cheapest way to tell the agent your build commands, style and project layout.',
  fix: "Create CLAUDE.md (or the agent's equivalent) with build and test commands, code style rules and a short project layout.",
  run(ctx) {
    const findings: Finding[] = [];
    for (const agent of ctx.model.agents) {
      const hasInstructionFile = ctx.model.instructions.some((f) => f.agent === agent);
      if (!hasInstructionFile) {
        findings.push({
          ruleId: 'INS-01',
          category: 'instructions',
          severity: 'low',
          agent,
          message: `No instruction file found for ${agent}`,
          why: ins01.why,
          fix: ins01.fix,
        });
      }
    }
    return findings;
  },
};
