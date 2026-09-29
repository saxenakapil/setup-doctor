import type { Finding, Rule } from '../core/types.js';

// Same secret-like name vocabulary src/adapters/mcp-common.ts's
// computeSecretLikeEnvKeys checks for env/header keys (key, token, secret,
// password, auth), kept as its own local constant rather than imported: a
// rule must stay a pure function of the normalized model, independent of
// adapter internals, even for a small shared word list.
const SECRET_LIKE_VAR_RE = /(key|token|secret|password|passwd|auth|credential)/i;
const VAR_REF_RE = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g;

export const set05: Rule = {
  id: 'SET-05',
  category: 'settings',
  title: 'Hook command references a secret-like environment variable',
  agents: ['claude', 'copilot'],
  heuristic: true,
  severityLabel: 'medium',
  why: 'Hook output is often captured in logs or terminal history; a command that expands a secret-like variable can leak its value there even though the file itself has no secret in it.',
  fix: 'Avoid referencing secret-like variables directly in hook commands; if the script genuinely needs the value, have the script itself read it without echoing or logging it.',
  run(ctx) {
    const findings: Finding[] = [];
    for (const hook of ctx.model.hooks) {
      VAR_REF_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = VAR_REF_RE.exec(hook.command)) !== null) {
        const varName = match[1] as string;
        if (!SECRET_LIKE_VAR_RE.test(varName)) continue;
        findings.push({
          ruleId: 'SET-05',
          category: 'settings',
          severity: 'medium',
          agent: hook.agent,
          sharedWith: hook.sharedWith?.filter((a) => set05.agents.includes(a)),
          file: hook.sourcePath,
          message: `Hook ${hook.event} in ${hook.sourcePath} references $${varName}, which may leak its value into hook logs (possible)`,
          why: set05.why,
          fix: set05.fix,
          possible: true,
        });
        break; // one finding per hook is enough; multiple secret-like refs in one command don't need N findings
      }
    }
    return findings;
  },
};
