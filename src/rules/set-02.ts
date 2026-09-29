import type { Finding, Rule } from '../core/types.js';

// Fix mode's safe set (docs/scope.md section 14): removing a hook that
// already cannot run changes no real behavior. Only offered for the shared
// .claude/settings.json / settings.local.json shape (which
// removeHookFromSettingsJson knows how to structurally edit), never for
// Copilot's own native .github/hooks/*.json or ~/.copilot/hooks/*.json
// format, which has a different shape and no removal support (yet).
function isFixableSourceFile(sourcePath: string): boolean {
  return sourcePath.endsWith('settings.json') || sourcePath.endsWith('settings.local.json');
}

export const set02: Rule = {
  id: 'SET-02',
  category: 'settings',
  title: 'Hook points to a missing script',
  agents: ['claude', 'copilot'],
  heuristic: false,
  fixable: true,
  severityLabel: 'high',
  why: 'A broken hook silently fails or blocks actions.',
  fix: 'Correct the path, make the script executable, or remove the hook.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const hook of ctx.model.hooks) {
      const check = hook.scriptCheck;
      if (!check) continue;
      if (check.exists && check.executable) continue;
      const fixable = isFixableSourceFile(hook.sourcePath);
      findings.push({
        ruleId: 'SET-02',
        category: 'settings',
        severity: 'high',
        agent: hook.agent,
        sharedWith: hook.sharedWith?.filter((a) => set02.agents.includes(a)),
        file: hook.sourcePath,
        message: `Hook ${hook.event} in ${hook.sourcePath} points to ${check.resolvedPath} which is missing or not executable`,
        why: set02.why,
        fix: set02.fix,
        fixable,
        fixHint: fixable ? { kind: 'remove-hook', event: hook.event, command: hook.command } : undefined,
      });
    }
    return findings;
  },
};
