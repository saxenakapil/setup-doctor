import { RULE_DEFAULTS } from '../core/defaults.js';
import { jaccard, wordSet } from '../core/text.js';
import type { Agent, Finding, Rule } from '../core/types.js';
import { collectTextLines, type TextLine } from './util.js';

const NEGATIVE_CUE_RE = /\b(never|do not|don't|avoid|must not)\b/;
const POSITIVE_CUE_RE = /\b(always|must|should|prefer|use)\b/;
// Tokens as they appear after text.ts's wordSet tokenization (splits on non
// letters/digits, so "don't" becomes "don" + "t", and "t" is dropped as < 2 chars).
const CUE_WORD_TOKENS = new Set(['always', 'must', 'should', 'prefer', 'use', 'never', 'do', 'not', 'don', 'avoid']);

type Polarity = 'positive' | 'negative';

function classify(normalized: string): Polarity | null {
  if (NEGATIVE_CUE_RE.test(normalized)) return 'negative';
  if (POSITIVE_CUE_RE.test(normalized)) return 'positive';
  return null;
}

function contentWords(normalized: string): Set<string> {
  const words = wordSet(normalized);
  const out = new Set<string>();
  for (const w of words) if (!CUE_WORD_TOKENS.has(w)) out.add(w);
  return out;
}

export const ins04: Rule = {
  id: 'INS-04',
  category: 'instructions',
  title: 'Possible contradictions',
  agents: ['claude', 'codex', 'cursor', 'copilot'],
  heuristic: true,
  severityLabel: 'medium',
  why: 'Conflicting rules make the agent behavior unpredictable.',
  fix: 'Decide which rule wins and remove or reword the other. Say which situation each rule applies to.',
  run(ctx) {
    const { jaccardThreshold } = { ...RULE_DEFAULTS['INS-04'], ...(ctx.config.thresholds['INS-04'] ?? {}) };
    const findings: Finding[] = [];

    const byAgent = new Map<Agent, TextLine[]>();
    for (const file of ctx.model.instructions) {
      const list = byAgent.get(file.agent) ?? [];
      list.push(...collectTextLines(file));
      byAgent.set(file.agent, list);
    }

    for (const [agent, lines] of byAgent) {
      const positives = lines.filter((l) => classify(l.normalized) === 'positive');
      const negatives = lines.filter((l) => classify(l.normalized) === 'negative');

      for (const p of positives) {
        const pWords = contentWords(p.normalized);
        if (pWords.size < 2) continue;
        for (const n of negatives) {
          const nWords = contentWords(n.normalized);
          if (nWords.size < 2) continue;
          if (jaccard(pWords, nWords) >= jaccardThreshold) {
            findings.push({
              ruleId: 'INS-04',
              category: 'instructions',
              severity: 'medium',
              agent,
              sharedWith: p.sharedWith?.filter((a) => ins04.agents.includes(a)),
              file: p.file,
              line: p.lineNumber,
              message: `Possible contradiction between ${p.file}:${p.lineNumber} and ${n.file}:${n.lineNumber}`,
              why: ins04.why,
              fix: ins04.fix,
              possible: true,
            });
          }
        }
      }
    }

    return findings;
  },
};
