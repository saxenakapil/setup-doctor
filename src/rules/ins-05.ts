import { VAGUE_RULES } from '../data/vague-rules.js';
import type { Finding, Rule } from '../core/types.js';
import { collectTextLines } from './util.js';

function stripTrailingPunctuation(s: string): string {
  return s.replace(/[.!?,;:]+$/, '');
}

export const ins05: Rule = {
  id: 'INS-05',
  category: 'instructions',
  title: 'Vague rules',
  agents: ['claude', 'codex', 'cursor', 'copilot'],
  heuristic: false,
  severityLabel: 'low',
  why: 'Rules the agent cannot act on add tokens without changing behavior.',
  fix: 'Replace vague rules with specific ones, for example "Use 2 space indentation and single quotes".',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.model.instructions) {
      const hits: number[] = [];
      for (const line of collectTextLines(file)) {
        const stripped = stripTrailingPunctuation(line.normalized);
        const wordCount = stripped.split(/\s+/).filter(Boolean).length;
        if (wordCount === 0 || wordCount > 12) continue;
        if (VAGUE_RULES.includes(stripped)) hits.push(line.lineNumber);
      }
      if (hits.length > 0) {
        findings.push({
          ruleId: 'INS-05',
          category: 'instructions',
          severity: 'low',
          agent: file.agent,
          sharedWith: file.sharedWith?.filter((a) => ins05.agents.includes(a)),
          file: file.path,
          line: hits[0],
          message: `${hits.length} vague rules in ${file.path} (for example line ${hits[0]})`,
          why: ins05.why,
          fix: ins05.fix,
        });
      }
    }
    return findings;
  },
};
