import type { Finding, Rule } from '../core/types.js';

export const plg03: Rule = {
  id: 'PLG-03',
  category: 'plugins',
  title: 'Plugin installed but disabled',
  agents: ['claude'],
  heuristic: false,
  severityLabel: 'low',
  why: 'Unused plugins clutter the setup and may still cost disk and update effort.',
  fix: 'Uninstall plugins you do not plan to use.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const plugin of ctx.model.plugins) {
      if (plugin.enabled) continue;
      findings.push({
        ruleId: 'PLG-03',
        category: 'plugins',
        severity: 'low',
        agent: plugin.agent,
        message: `Plugin ${plugin.name} is installed but disabled`,
        why: plg03.why,
        fix: plg03.fix,
      });
    }
    return findings;
  },
};
