import type { Finding, Rule } from '../core/types.js';

const COMMAND_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint)\b/i,
  /\bpytest\b/i,
  /\bgo test\b/i,
  /\bcargo\s+(test|build)\b/i,
  /\bmake\s+(test|build)\b/i,
  /\bmvn\b/i,
  /\bgradle\b/i,
  /\bdotnet\s+(test|build)\b/i,
  /\brun (the )?tests\b/i,
  /\bbuild command\b/i,
  /\btest command\b/i,
];

function documentsBuildOrTest(text: string): boolean {
  return COMMAND_PATTERNS.some((re) => re.test(text));
}

export const ins07: Rule = {
  id: 'INS-07',
  category: 'instructions',
  title: 'No build or test command documented',
  agents: ['claude', 'codex', 'cursor', 'copilot', 'generic'],
  heuristic: false,
  severityLabel: 'low',
  why: 'Agents work better when they know how to build and verify their changes.',
  fix: 'Add the commands to run the build and the tests, for example "npm test" and "npm run build".',
  run(ctx) {
    if (ctx.model.buildManifests.length === 0) return [];
    const projectFiles = ctx.model.instructions.filter((f) => f.scope === 'project').sort((a, b) => a.path.localeCompare(b.path));
    if (projectFiles.length === 0) return [];
    const documented = projectFiles.some((f) => documentsBuildOrTest(f.text));
    if (documented) return [];
    const first = projectFiles[0];
    if (!first) return [];
    return [
      {
        ruleId: 'INS-07',
        category: 'instructions',
        severity: 'low',
        agent: first.agent,
        sharedWith: first.sharedWith?.filter((a) => ins07.agents.includes(a)),
        file: first.path,
        message: `No build or test command documented in ${first.path}`,
        why: ins07.why,
        fix: ins07.fix,
      },
    ];
  },
};
