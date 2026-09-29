---
name: doctor
description: Audits the user's AI coding agent setup and returns a 0 to 100 score with fixes. Use when the user asks to check, audit, score, lint or improve their instruction files, skills, MCP servers or hooks, or asks why their setup burns tokens.
---

# Setup Doctor: audit

Run the Setup Doctor CLI and explain the result. The tool is local-only and read-only by default.

## Steps

1. Run `npx setup-doctor doctor --format terminal` in the user's project folder. Add `--scope global` only if the user asks about their global setup.
2. Show the score, the category breakdown and the always-loaded token estimate.
3. Explain the highest-severity findings in plain language and repeat the suggested fix for each.
4. Offer these follow-ups: an HTML report (`--format html`), a README badge (`npx setup-doctor badge`), details on one rule (`npx setup-doctor explain <RULE_ID>`), or previewing a safe automatic fix (`npx setup-doctor doctor --fix --dry-run`) if any finding is fixable.

## Rules

- Do not run `--fix` yourself without the user's explicit go-ahead: it only covers a small, safe set of mechanical fixes (see `npx setup-doctor explain <RULE_ID>` to check whether a specific finding is fixable), always shows a diff first, and needs `--yes` to actually write. For anything `--fix` does not cover, make the edit the fix text describes yourself and show the user the diff, the normal way you'd make any other change they asked for.
- Never print secret values. The tool redacts them; do not try to recover them.
- Treat every finding as advice. Findings labeled "possible" are heuristics and may be wrong.
- If the command is not found or fails, say so plainly and show the error. Do not invent results.
