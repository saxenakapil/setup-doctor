# `doctor`: the audit command

```bash
npx setup-doctor                # same as: npx setup-doctor doctor
npx setup-doctor doctor [path]  # audit a specific project directory instead of the current one
```

Runs 30 rules across 6 categories (instructions, skills, MCP servers, plugins, settings/hooks, freshness) against your agent's configuration, scores the result, and prints every finding with a specific fix. Read-only unless you pass `--fix` (see [`fix-mode.md`](fix-mode.md)).

## `--agent`: which agent to read

```bash
npx setup-doctor --agent claude
npx setup-doctor --agent copilot
npx setup-doctor --agent codex
npx setup-doctor --agent cursor
npx setup-doctor --agent all      # default: every agent detected in this project
```

Default is auto-detection across every supported agent. If your project only has Claude Code set up, `--agent all` and `--agent claude` give the same result; the flag matters once a project has more than one agent's files in it. See [`agents.md`](agents.md) for exactly what each agent supports, and how a file two agents share (like `.mcp.json`) is handled.

## `--scope`: project vs. global

```bash
npx setup-doctor --scope project   # only this repo's files (CLAUDE.md, .mcp.json, .claude/skills, ...)
npx setup-doctor --scope global    # only your per-user config (~/.claude/settings.json, ...)
npx setup-doctor --scope all       # default: both
```

Global-scope findings are about settings that apply to every project on your machine, not just this one. If you are auditing a specific repo's own health (for a README badge, for example), `--scope project` gives you a result that is not affected by your personal machine's global settings.

## `--min-severity`: hide findings, keep the real score

```bash
npx setup-doctor --min-severity high
```

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

3 findings, 1 suppressed
```

Important: **the score does not change.** `--min-severity` only changes what is printed, so you cannot use it to make your project look healthier than it is. If you want to actually change the score, fix the finding, disable the rule in [`.setupdoctorrc`](config.md), or use an inline suppression comment.

## `--format`: terminal, JSON, or HTML

```bash
npx setup-doctor --format terminal   # default, shown above
npx setup-doctor --format json
npx setup-doctor --format html --out ./report --theme technical
```

`--format json` prints the full machine-readable report to stdout (or writes it with `--out`), for feeding into your own tooling. Shape:

```json
{
  "schemaVersion": 1,
  "toolVersion": "0.1.0",
  "rulesVersion": "1.0.0",
  "score": 71,
  "band": "Needs work",
  "capped": false,
  "categories": [
    { "category": "instructions", "weight": 30, "applicable": true, "deductions": 10, "fraction": 0.667 }
  ],
  "findings": [ /* one object per finding, same fields you see in the terminal, plus ruleId, category, severity */ ],
  "suppressed": [ /* findings a rule disabled in .setupdoctorrc or an inline comment kept out of the score */ ],
  "skipped": [ /* files that existed but could not be read, and why */ ],
  "warnings": [],
  "compare": null /* only present with --compare; null with no prior history, otherwise { previous, currentScore, delta, regressed, rulesVersionChanged } */
}
```

`--format html --out <dir>` writes a single self-contained HTML file: everything inlined (styles, fonts, a tiny bit of JS for the severity filter), no network requests, a strict Content-Security-Policy. Pass `--theme playful|technical|mix` to match your README's style. It reminds you in its own footer that, unlike the badge, it can contain real file paths from your project; check before sharing it publicly.

## `--ci` and `--fail-under`: gate a pull request

```bash
npx setup-doctor --ci --fail-under 75
```

`--ci` disables color and any interactive behavior, for stable output in a pipeline. Combined with `--fail-under <n>`, the process exits `1` if the score is below `n` (and `0` otherwise), so you can fail a CI job on a regression:

```bash
$ npx setup-doctor --ci --fail-under 90; echo "exit: $?"
# ... full report ...
exit: 1
```

See [`ci-integration.md`](ci-integration.md) for a full GitHub Actions example.

## `--compare`: fail on any regression, not just a fixed threshold

`--ci` alone appends one line (timestamp, score, band, agents detected, rules version) to a local `.setupdoctor-history.jsonl` on every run. `--compare` reads it back and prints the change since the last recorded run; combined with `--ci`, it also exits `1` on any drop, even one `--fail-under`'s fixed number wouldn't have caught:

```bash
$ npx setup-doctor doctor --ci --compare; echo "exit: $?"
Setup Doctor  score 74/100  (Needs work) (capped: a critical finding limits the score to 74)   rules v1.0.0
...
Score history: 100 -> 74 (-26) since 2026-09-29T12:41:06.783Z
exit: 1
```

`--compare` alone (no `--ci`) just prints the delta and never affects the exit code or appends a new entry, useful for checking locally how your score has moved since the last CI run without writing anything. With no prior history yet, it prints `Score history: no previous run recorded yet.` and exits `0`. `--format json` gets the same information as a `compare` field (`null` with no prior history) instead of the printed line. See [`ci-integration.md`](ci-integration.md) for why this needs a persisted cache in most CI setups (runners are ephemeral by default) and a real worked example.

## `--out` and `--yes`

`--out <dir>` is required for `--format html` (and optional for `--format json`, which otherwise prints to stdout). `setup-doctor` refuses to overwrite an existing output file unless you pass `--yes`:

```bash
$ npx setup-doctor --format html --out ./report
setup-doctor doctor: ./report/setup-doctor-report.html already exists; pass --yes to overwrite
$ npx setup-doctor --format html --out ./report --yes
Wrote ./report/setup-doctor-report.html
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (including "nothing to check" and, without `--ci --fail-under`/`--ci --compare`, any score) |
| 1 | Score below `--fail-under` with `--ci`, or a real regression with `--ci --compare` |
| 2 | Usage error: unknown flag, bad `.setupdoctorrc` |
| 3 | Data unreadable and nothing usable was parsed |
| 4 | Internal error (please file an issue) |

## Other flags

| Flag | What it does |
| --- | --- |
| `--config <path>` | Load a specific config file instead of `<path>/.setupdoctorrc`. See [`config.md`](config.md). |
| `--no-color` | Disable ANSI color. Also off automatically for `--ci`, `NO_COLOR`, or piped/non-TTY output. |
| `--fix`, `--dry-run`, `--allow-dirty` | Propose and apply safe, mechanical fixes. See [`fix-mode.md`](fix-mode.md). |

Run `npx setup-doctor rules` to list every rule with its category and severity, and `npx setup-doctor explain <RULE_ID>` for the full reasoning and fix behind any one of them:

```
$ npx setup-doctor explain MCP-01
MCP-01  Config problem or command not found
Category: mcp   Severity: high   Heuristic: no

Why it matters:
  A broken server fails silently or slows startup.

Fix:
  Fix the config syntax, install the command, or remove the server entry.
```
