import type { Finding, Rule } from '../core/types.js';

function folderFromManifestPath(manifestPath: string, fallback: string): string {
  const parts = manifestPath.split('/');
  return parts.length >= 3 ? (parts[parts.length - 3] as string) : fallback;
}

export const plg01: Rule = {
  id: 'PLG-01',
  category: 'plugins',
  title: 'Invalid plugin manifest',
  agents: ['claude'],
  heuristic: false,
  severityLabel: 'high',
  why: 'A plugin with a bad manifest may fail to load.',
  fix: 'Fix plugin.json so it is valid JSON with a kebab-case name, or remove the plugin.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const plugin of ctx.model.plugins) {
      if (plugin.manifestValid) continue;
      const folder = folderFromManifestPath(plugin.manifestPath, plugin.name);
      findings.push({
        ruleId: 'PLG-01',
        category: 'plugins',
        severity: 'high',
        agent: plugin.agent,
        file: plugin.manifestPath,
        message: `Plugin ${folder}: ${plugin.manifestError}`,
        why: plg01.why,
        fix: plg01.fix,
      });
    }
    return findings;
  },
};
