import { RETIRED_MODELS } from '../data/retired-models.js';
import type { Finding, Rule } from '../core/types.js';

const PATTERNS = RETIRED_MODELS.map((name) => ({ name, re: new RegExp(`\\b${name}\\b`, 'i') }));

function findMentions(text: string): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  text.split('\n').forEach((raw, idx) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(raw)) out.push({ name, line: idx + 1 });
    }
  });
  return out;
}

export const frs02: Rule = {
  id: 'FRS-02',
  category: 'freshness',
  title: 'Retired model names',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'Requests to retired models fail.',
  fix: "Replace it with a current model name from the provider's model list.",
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.model.instructions) {
      for (const hit of findMentions(file.text)) {
        findings.push({
          ruleId: 'FRS-02',
          category: 'freshness',
          severity: 'medium',
          agent: file.agent,
          file: file.path,
          line: hit.line,
          message: `${file.path}:${hit.line} mentions retired model ${hit.name}`,
          why: frs02.why,
          fix: frs02.fix,
        });
      }
    }
    for (const skill of ctx.model.skills) {
      for (const hit of findMentions(skill.text)) {
        findings.push({
          ruleId: 'FRS-02',
          category: 'freshness',
          severity: 'medium',
          agent: skill.agent,
          file: skill.path,
          line: hit.line,
          message: `${skill.path}:${hit.line} mentions retired model ${hit.name}`,
          why: frs02.why,
          fix: frs02.fix,
        });
      }
    }
    return findings;
  },
};
