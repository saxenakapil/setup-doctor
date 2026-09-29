import { RULE_DEFAULTS } from '../core/defaults.js';
import { dice } from '../core/text.js';
import type { Agent, Finding, Rule } from '../core/types.js';
import { collectTextLines, type TextLine } from './util.js';

class UnionFind {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x] as number] as number;
      x = this.parent[x] as number;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

function isDuplicate(a: string, b: string, diceThreshold: number): boolean {
  if (a === b) return true;
  return dice(a, b) >= diceThreshold;
}

export const ins03: Rule = {
  id: 'INS-03',
  category: 'instructions',
  title: 'Duplicate rules',
  agents: ['claude', 'codex', 'cursor'],
  heuristic: false,
  fixable: true,
  severityLabel: 'medium',
  why: 'Repeated rules waste tokens and drift apart when only one copy is edited.',
  fix: 'Keep each rule in one place and delete the other copies.',
  run(ctx) {
    const { diceThreshold, minLineChars } = { ...RULE_DEFAULTS['INS-03'], ...(ctx.config.thresholds['INS-03'] ?? {}) };
    const findings: Finding[] = [];

    const byAgent = new Map<Agent, TextLine[]>();
    for (const file of ctx.model.instructions) {
      const lines = collectTextLines(file).filter((l) => l.normalized.length >= minLineChars);
      const list = byAgent.get(file.agent) ?? [];
      list.push(...lines);
      byAgent.set(file.agent, list);
    }

    for (const [agent, lines] of byAgent) {
      const uf = new UnionFind(lines.length);
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const a = lines[i] as TextLine;
          const b = lines[j] as TextLine;
          if (isDuplicate(a.normalized, b.normalized, diceThreshold)) uf.union(i, j);
        }
      }

      const clusters = new Map<number, TextLine[]>();
      lines.forEach((line, idx) => {
        const root = uf.find(idx);
        const cluster = clusters.get(root) ?? [];
        cluster.push(line);
        clusters.set(root, cluster);
      });

      for (const cluster of clusters.values()) {
        if (cluster.length < 2) continue;
        cluster.sort((a, b) => a.file.localeCompare(b.file) || a.lineNumber - b.lineNumber);
        const distinctFiles = [...new Set(cluster.map((l) => l.file))].sort();
        const first = cluster[0] as TextLine;
        const message =
          distinctFiles.length === 1
            ? `${cluster.length} rules repeat within ${distinctFiles[0]}`
            : `${cluster.length} rules repeat between ${distinctFiles[0]} and ${distinctFiles[1]}`;
        const allExactMatches = cluster.every((l) => l.normalized === first.normalized);
        const fixable = distinctFiles.length === 1 && allExactMatches;

        findings.push({
          ruleId: 'INS-03',
          category: 'instructions',
          severity: 'medium',
          agent,
          file: first.file,
          line: first.lineNumber,
          message,
          why: ins03.why,
          fix: ins03.fix,
          fixable,
          // Keep the first occurrence, remove the rest. Only meaningful (and
          // only set) for the same-file exact-duplicate safe-fix case.
          fixHint: fixable ? { kind: 'remove-lines', lines: cluster.slice(1).map((l) => l.lineNumber) } : undefined,
        });
      }
    }

    return findings;
  },
};
