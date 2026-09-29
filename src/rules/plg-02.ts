import type { Finding, PluginInfo, Rule } from '../core/types.js';

export const plg02: Rule = {
  id: 'PLG-02',
  category: 'plugins',
  title: 'Name collisions between plugins',
  agents: ['claude'],
  heuristic: false,
  severityLabel: 'medium',
  why: 'Colliding names make it unclear which one runs.',
  fix: 'Disable one plugin or rename one of the commands.',
  run(ctx) {
    const byName = new Map<string, PluginInfo[]>();
    for (const plugin of ctx.model.plugins) {
      if (!plugin.enabled) continue;
      for (const name of [...plugin.skillNames, ...plugin.commandNames]) {
        const list = byName.get(name) ?? [];
        list.push(plugin);
        byName.set(name, list);
      }
    }

    const findings: Finding[] = [];
    const reported = new Set<string>();
    for (const [name, plugins] of byName) {
      const distinct = [...new Set(plugins.map((p) => p.name))].sort();
      if (distinct.length < 2) continue;
      const key = `${distinct[0]}|${distinct[1]}|${name}`;
      if (reported.has(key)) continue;
      reported.add(key);
      findings.push({
        ruleId: 'PLG-02',
        category: 'plugins',
        severity: 'medium',
        agent: plugins[0]?.agent,
        message: `Plugins ${distinct[0]} and ${distinct[1]} both define ${name}`,
        why: plg02.why,
        fix: plg02.fix,
      });
    }
    return findings;
  },
};
