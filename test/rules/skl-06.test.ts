import { describe, expect, it } from 'vitest';
import { skl06 } from '../../src/rules/skl-06.js';
import { emptyModel } from '../../src/core/runner.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';
import type { SessionRecord, Skill } from '../../src/core/types.js';

const NOW = '2026-09-29T12:00:00.000Z';

function skill(name: string): Skill {
  return {
    agent: 'claude',
    scope: 'project',
    path: `.claude/skills/${name}/SKILL.md`,
    sizeBytes: 100,
    kind: 'skill',
    folder: `.claude/skills/${name}`,
    name,
    description: `Does ${name} things.`,
    frontmatterValid: true,
    lineCount: 10,
    text: '',
    relativeRefs: [],
  };
}

function record(daysAgo: number, tools: string[]): SessionRecord {
  const ts = new Date(new Date(NOW).getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { agent: 'claude', sessionId: 's1', project: 'p', ts, kind: 'assistant', tools };
}

describe('SKL-06 Skill not used recently', () => {
  it('triggers when 20 days of logs show no use of the skill', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], skills: [skill('alpha')] };
    const sessions = [record(20, ['Read']), record(0, ['Bash'])];
    const findings = skl06.run({ model, config: DEFAULT_CONFIG, sessions, now: NOW });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.possible).toBe(true);
    expect(findings[0]?.message).toContain('alpha');
  });

  it('does not trigger when logs cover only 5 days', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], skills: [skill('alpha')] };
    const sessions = [record(5, ['Read']), record(0, ['Bash'])];
    expect(skl06.run({ model, config: DEFAULT_CONFIG, sessions, now: NOW })).toEqual([]);
  });

  it('does not trigger when the skill was used once in the window', () => {
    const model = { ...emptyModel(), agents: ['claude' as const], skills: [skill('alpha')] };
    const sessions = [record(20, ['alpha']), record(0, ['Bash'])];
    expect(skl06.run({ model, config: DEFAULT_CONFIG, sessions, now: NOW })).toEqual([]);
  });
});
