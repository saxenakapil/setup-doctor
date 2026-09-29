# Getting started

`setup-doctor` audits how your AI coding agent (Claude Code, GitHub Copilot CLI, Codex or Cursor) is configured, scores it 0-100, and tells you exactly what to fix. Everything runs locally. No install, no account, no network calls.

## Run it once

From the root of any project:

```bash
npx setup-doctor
```

That is the full command. No arguments needed: it auto-detects which agent(s) you use in this project and reads both project-level files (like `CLAUDE.md`) and your global, per-user config (like `~/.claude/settings.json`).

A real run looks like this:

```
Setup Doctor  score 72/100  (Needs work)   rules v1.0.0

Instruction files  20/30   Skills  22/25   MCP  8/15   Plugins  n/a   Settings  5/10   Freshness  10/10

Always-loaded context: about 40 tokens

CRIT  INS-08  Secret-like value in CLAUDE.md:5 ([REDACTED])
      Fix: Remove the value, rotate the credential, and read it from an environment variable instead.
HIGH  MCP-01  MCP server notion uses command notion-mcp-server which was not found on PATH
      Fix: Fix the config syntax, install the command, or remove the server entry.
HIGH  SET-01  Permission rule Bash(curl:*) in .claude/settings.json allows unrestricted or risky commands
      Fix: Replace it with narrow rules such as Bash(npm test:*), and keep dangerous commands behind a prompt.
MED   SKL-02  Skill pr-reviewer has a description of 7 characters (too short)
      Fix: Write one or two sentences that say what the skill does and when to use it.
LOW   SKL-06  Skill pr-reviewer was not used in the last 30 days (possible)
      Fix: Remove the skill or disable it if you no longer need it.
LOW   MCP-05  MCP server linear was not used in the last 30 days (possible)
      Fix: Remove or disable the server if you no longer need it.
LOW   MCP-05  MCP server notion was not used in the last 30 days (possible)
      Fix: Remove or disable the server if you no longer need it.

7 findings, 1 suppressed
```

That is real output (from a small demo project, not fabricated), not a mockup: [`docs/examples/demo-terminal.png`](../examples/demo-terminal.png) shows the same idea with color.

## Reading the score line

```
Setup Doctor  score 72/100  (Needs work)   rules v1.0.0
Instruction files  20/30   Skills  22/25   MCP  8/15   Plugins  n/a   Settings  5/10   Freshness  10/10
```

- **The overall score** is 0-100, in one of four bands: Excellent (90-100), Good (75-89), Needs work (50-74), Poor (0-49).
- **The category breakdown** shows where points were lost. `n/a` means that category does not apply here (for example, Codex and Cursor have no plugin concept, so `Plugins` is `n/a`, not `0/10`: it is excluded from the score entirely, not counted against you).
- **"Always-loaded context"** is an estimate of how many tokens your instruction files and skill descriptions cost on every single turn, whether they are relevant or not. This is a real cost people forget about.
- A **critical finding caps the score at 74** regardless of anything else. A leaked API key is not a "5 point deduction" kind of problem.

## Reading a finding

```
HIGH  MCP-01  MCP server notion uses command notion-mcp-server which was not found on PATH
      Fix: Fix the config syntax, install the command, or remove the server entry.
```

Every finding has: a severity (`CRIT`/`HIGH`/`MED`/`LOW`), a rule ID you can look up with `setup-doctor explain <ID>`, a specific message naming the exact file and problem, and a concrete fix. There is no generic "improve your setup" advice anywhere in this tool.

A `(possible)` suffix, like on the `MCP-05` findings above, means the finding is a heuristic guess, not a certainty; see [`agents.md`](agents.md) for what triggers those and how they affect (or do not affect) your score.

## What to do next

- Fix the `CRIT` and `HIGH` findings first; they matter most and CRIT ones cap your score regardless.
- Run `setup-doctor explain <RULE_ID>` for the full reasoning behind any finding.
- If a finding is fixable automatically, `setup-doctor --fix --dry-run` will show you (see [`fix-mode.md`](fix-mode.md)).
- Once you are happy with a score, add the real badge to your README (see [`README.md`](../../README.md#badge)) so it stays visible.
- Read [`doctor.md`](doctor.md) for every flag `doctor` supports, [`wrapped.md`](wrapped.md) for the usage-summary command, and [`config.md`](config.md) if you want to tune thresholds or silence a specific rule project-wide.
