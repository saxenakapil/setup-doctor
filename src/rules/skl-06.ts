import type { Finding, Rule } from '../core/types.js';
import { hasCoverageDays, usedSkillInWindow } from './session-util.js';

const MIN_COVERAGE_DAYS = 14;
const WINDOW_DAYS = 30;

export const skl06: Rule = {
  id: 'SKL-06',
  category: 'skills',
  title: 'Skill not used recently',
  agents: ['claude'],
  heuristic: true,
  needsSessions: true,
  severityLabel: 'low',
  why: 'Unused skills still cost description tokens every turn.',
  fix: 'Remove the skill or disable it if you no longer need it.',
  run(ctx) {
    const sessions = ctx.sessions ?? [];
    if (!hasCoverageDays(sessions, MIN_COVERAGE_DAYS)) return [];
    const now = ctx.now ?? new Date().toISOString();

    const findings: Finding[] = [];
    for (const skill of ctx.model.skills) {
      if (!skill.name) continue;
      if (usedSkillInWindow(sessions, skill.name, now, WINDOW_DAYS)) continue;
      findings.push({
        ruleId: 'SKL-06',
        category: 'skills',
        severity: 'low',
        agent: skill.agent,
        sharedWith: skill.sharedWith,
        file: skill.path,
        message: `Skill ${skill.name} was not used in the last 30 days (possible)`,
        why: skl06.why,
        fix: skl06.fix,
        possible: true,
      });
    }
    return findings;
  },
};
