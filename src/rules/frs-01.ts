import type { Finding, Rule } from '../core/types.js';
import { collectTextLines } from './util.js';

const VERSION_PATTERNS = [
  /\b(Node(\.js)?|Python|Java|Go|Rust|Ruby|PHP|Spring Boot|Django|Rails|React|Next\.js|Angular|Vue|TypeScript|Kubernetes|Terraform)\s+v?\d+(\.\d+){1,2}\b/,
  /\b(Node|Java)\s+\d{2}\b/,
];

function firstMatch(text: string): string | null {
  for (const re of VERSION_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

export const frs01: Rule = {
  id: 'FRS-01',
  category: 'freshness',
  title: 'Hard-pinned versions in instructions',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  severityLabel: 'low',
  why: 'Pinned versions go stale and then mislead the agent.',
  fix: 'Point to the source of truth instead, such as the engines field in package.json or a .tool-versions file.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.model.instructions) {
      let count = 0;
      let example: string | null = null;
      for (const line of collectTextLines(file)) {
        const m = firstMatch(line.raw);
        if (!m) continue;
        count++;
        if (!example) example = m;
      }
      if (count === 0) continue;
      findings.push({
        ruleId: 'FRS-01',
        category: 'freshness',
        severity: 'low',
        agent: file.agent,
        sharedWith: file.sharedWith,
        file: file.path,
        message: `${count} hard-pinned versions in ${file.path} (for example "${example}")`,
        why: frs01.why,
        fix: frs01.fix,
      });
    }
    return findings;
  },
};
