---
name: doctor
description: Audits the user's AI coding agent setup and returns a 0 to 100 score with fixes. Use when the user asks to check, audit, score, lint or improve their CLAUDE.md, skills, MCP servers, plugins, hooks or permissions, asks why their setup burns tokens, or runs /setup-doctor:doctor.
---

# Setup Doctor: audit

Run the Setup Doctor CLI and explain the result. The tool is local-only and read-only by default.

## Steps

1. Run `npx setup-doctor doctor --format terminal` in the user's project folder. Add `--scope global` only if the user asks about their global setup.
2. Show the score, the category breakdown and the always-loaded token estimate.
3. Explain the highest-severity findings in plain language and repeat the suggested fix for each.
4. Offer these follow-ups: an HTML report (`--format html`), a README badge (`npx setup-doctor badge`), or details on one rule (`npx setup-doctor explain <RULE_ID>`).

## Rules

- Do not edit the user's files unless they ask. If they want fixes applied, use `npx setup-doctor doctor --fix --dry-run` first, show the diff, and run `--fix` only after they confirm.
- Never print secret values. The tool redacts them; do not try to recover them.
- Treat every finding as advice. Findings labeled "possible" are heuristics and may be wrong.
- If the command is not found or fails, say so plainly and show the error. Do not invent results.
