# doctor

`doctor` audits your agent configuration, scores it from 0 to 100, and prints every finding with a fix. It is the default command.

```bash
npx setup-doctor                 # same as: npx setup-doctor doctor
npx setup-doctor doctor [path]   # audit a specific directory
```

It runs 30 rules across six categories: instructions, skills, MCP servers, plugins, settings and hooks, and freshness. It is read-only unless you pass `--fix`. See [fix mode](fix-mode.md).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--agent <name>` | auto-detect | `claude`, `codex`, `cursor`, `copilot` or `all`. |
| `--scope <scope>` | `all` | `project`, `global` or `all`. |
| `--format <format>` | `terminal` | `terminal`, `json` or `html`. |
| `--out <dir>` | none | Output directory. Required for `--format html`. Optional for `--format json`. |
| `--yes` | off | Overwrite existing output files without asking. |
| `--theme <name>` | `playful` | `playful`, `technical` or `mix`. Applies to `--format html`. |
| `--min-severity <level>` | `low` | Hide findings below `low`, `medium`, `high` or `critical`. The score is not affected. |
| `--ci` | off | No prompts and no color. Stable output for pipelines. |
| `--fail-under <n>` | none | With `--ci`, exit 1 if the score is below `n`. |
| `--compare` | off | Print the score change since the last `--ci` run. With `--ci`, exit 1 on a drop. |
| `--config <path>` | `<path>/.setupdoctorrc` | Use a specific configuration file. See [configuration](config.md). |
| `--no-color` | off | Disable color. Color is also off for `--ci`, when `NO_COLOR` is set, and for non-TTY output. |
| `--fix` | off | Propose safe, mechanical fixes. See [fix mode](fix-mode.md). |
| `--dry-run` | off | With `--fix`, show the diffs and change nothing. |
| `--allow-dirty` | off | With `--fix`, allow edits to project files when the project may have uncommitted changes. |

Run `setup-doctor --help` for the same list in your terminal.

## Scope and agents

By default, all detected agents and both scopes are checked.

- `--scope project` checks only files in the repository, such as `CLAUDE.md`, `.mcp.json` and `.claude/skills`.
- `--scope global` checks only per-user configuration, such as `~/.claude/settings.json`.
- `--agent claude` checks only Claude Code. When a project has only one agent's files, `--agent all` and `--agent claude` produce the same result.

For a repository's own health (for a badge, for example), use `--scope project`. The result is then independent of your personal machine's settings.

A file that two agents share, such as `.mcp.json`, is scored once. The report notes which other agent it also affects. See [agents](agents.md).

## Output formats

### Terminal

The default. Shown in [getting started](getting-started.md).

### JSON

`--format json` writes the complete report to stdout, or to a file with `--out`:

```bash
npx setup-doctor --format json > report.json
```

Shape:

```json
{
  "schemaVersion": 1,
  "toolVersion": "0.3.2",
  "rulesVersion": "1.2.0",
  "theme": "playful",
  "agentsDetected": ["claude"],
  "score": 85,
  "band": "Good",
  "capped": false,
  "categories": [
    { "category": "instructions", "weight": 30, "applicable": true, "deductions": 1, "fraction": 0.967 }
  ],
  "overheadTokens": 0,
  "findings": [],
  "suppressed": [],
  "skipped": [],
  "warnings": []
}
```

| Field | Meaning |
| --- | --- |
| `score`, `band` | The overall result. `score` is `null` when too few checks apply. |
| `capped` | `true` when a critical finding limited the score. |
| `categories` | Per-category weight, deductions and fraction. `applicable: false` means excluded from the score. |
| `findings` | One object per finding. Each has `ruleId`, `category`, `severity`, `message`, `why`, `fix`, and `file` and `line` when relevant. |
| `suppressed` | Findings excluded from the score by `disabledRules` or an inline `doctor-ignore` comment. |
| `skipped` | Files that exist but could not be read, with the reason. |
| `warnings` | Non-fatal problems, such as unknown configuration keys. |
| `compare` | Present only with `--compare`. `null` when there is no previous run. |

### HTML

```bash
npx setup-doctor --format html --out ./report --theme technical
```

Writes one self-contained HTML file with styles and fonts inlined. It makes no network requests and uses a strict Content-Security-Policy. The report contains file paths from your project, so review it before sharing it publicly.

If the output file exists, the command refuses to overwrite it:

```
setup-doctor doctor: ./report/setup-doctor-report.html already exists; pass --yes to overwrite
```

Add `--yes` to overwrite.

## Filtering with `--min-severity`

```bash
npx setup-doctor --min-severity high
```

This hides lower-severity findings from the output. The score does not change, so filtering cannot make a project look healthier than it is. The summary counts only the findings shown.

To change the score, fix the finding, disable the rule in [configuration](config.md), or add an inline `doctor-ignore` comment.

## Gating pull requests

```bash
npx setup-doctor --ci --fail-under 75
```

`--ci` disables color and prompts. With `--fail-under`, the command exits 1 when the score is below the threshold. See [CI integration](ci-integration.md) for complete workflows.

### Tracking regressions with `--compare`

`--ci` appends one line to `.setupdoctor-history.jsonl` on every run. `--compare` reads that file and reports the change since the last recorded run:

```bash
npx setup-doctor doctor --ci --compare
```

With `--ci`, a drop exits 1, even if the score is still above `--fail-under`. Without `--ci`, `--compare` only prints the change and writes nothing. With no previous run, it prints `Score history: no previous run recorded yet.` and exits 0.

Most CI runners are ephemeral, so the history file must be persisted between runs. See [CI integration](ci-integration.md#track-score-history-and-gate-on-regressions).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | `--ci` with `--fail-under` and the score is below the threshold, or `--ci --compare` detected a drop. |
| 2 | Usage or configuration error: an unknown or invalid option, or an invalid `.setupdoctorrc`. |
| 4 | Internal error. Please open an issue with the output. |

## Explaining rules

```bash
npx setup-doctor rules             # list every rule, its category, severity and whether it is enabled
npx setup-doctor explain MCP-01    # the reasoning and fix for one rule
```

```
MCP-01  Config problem or command not found
Category: mcp   Severity: high   Heuristic: no

Why it matters:
  A broken server fails silently or slows startup.

Fix:
  Fix the config syntax, install the command, or remove the server entry.
```

## Comparing two reports

```bash
npx setup-doctor diff before.json after.json
```

Explains how the score changed between two saved JSON reports: the score movement, new findings, resolved findings, and how many were unchanged. Findings are matched by rule, file and message, so moving a problem to a different line does not count as a change. A warning appears when the rule set changed between the two reports.
