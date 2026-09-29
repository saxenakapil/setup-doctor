# Configuration: `.setupdoctorrc`

An optional JSON file in your project root. `setup-doctor` reads it automatically; no flag needed.

```json
{
  "disabledRules": ["FRS-01"],
  "thresholds": {
    "SKL-02": { "minChars": 10 }
  }
}
```

## What actually changes when you set this

```bash
$ npx setup-doctor --agent claude --scope project
Setup Doctor  score 71/100  (Needs work)   rules v1.0.0
Instruction files  20/30   Skills  22/25   MCP  8/15   Plugins  n/a   Settings  5/10   Freshness  9/10
...
LOW   FRS-01  1 hard-pinned versions in CLAUDE.md (for example "Node 18")
      Fix: Point to the source of truth instead, such as the engines field in package.json or a .tool-versions file.

8 findings
```

Add the `.setupdoctorrc` above (disabling `FRS-01`), and:

```bash
$ npx setup-doctor --agent claude --scope project
Setup Doctor  score 72/100  (Needs work)   rules v1.0.0
Instruction files  20/30   Skills  22/25   MCP  8/15   Plugins  n/a   Settings  5/10   Freshness  10/10
...
7 findings, 1 suppressed
```

`FRS-01` is gone from the findings list, `Freshness` moved from `9/10` to `10/10`, and the score changed to reflect it. Suppressed findings are never silently dropped: the summary line and the JSON report's `suppressed` array both still show what was excluded and why, so a project-wide disable is always visible, not hidden.

## `disabledRules`

An array of rule IDs (case-insensitive) to disable everywhere in this project, in addition to any inline `<!-- doctor-ignore RULE-ID -->` comment in a specific file (see below). Run `npx setup-doctor rules` to see every rule ID and whether it is currently enabled:

```bash
$ npx setup-doctor rules
ID       CATEGORY      SEVERITY        ENABLED
INS-01   instructions  low             yes
...
FRS-01   freshness     low             no
```

## `thresholds`

Per-rule tunable numbers, for the handful of rules that have them:

| Rule | Field | Default | Meaning |
| --- | --- | --- | --- |
| `INS-02` | `warnTokens` / `highTokens` | 2000 / 5000 | Instruction file length before medium/high severity |
| `INS-03` | `diceThreshold` / `minLineChars` | 0.9 / 20 | Similarity threshold and minimum line length for duplicate detection |
| `INS-04` | `jaccardThreshold` | 0.6 | Word-overlap threshold for possible contradictions |
| `SKL-02` | `minChars` / `maxChars` | 20 / 500 | Skill description length before too-short/too-long |
| `SKL-03` | `jaccardThreshold` | 0.6 | Word-overlap threshold for overlapping skill descriptions |
| `SKL-04` | `maxLines` | 500 | Skill file length before "too long" |
| `MCP-04` | `maxServers` | 8 | Number of enabled MCP servers before "too many" |

## `--config <path>`: a config file somewhere else

```bash
npx setup-doctor --config ./configs/strict.json
```

Overrides the default `<project>/.setupdoctorrc` lookup entirely. Useful for a monorepo with several sub-projects that want different rule sets, or a shared, centrally-maintained config.

## Precedence and error handling

Command-line flags always win over `.setupdoctorrc`, which always wins over the built-in defaults. Invalid JSON is a usage error, not a silent fallback to defaults:

```bash
$ npx setup-doctor
Invalid JSON in /path/to/project/.setupdoctorrc: Unexpected token 'o', "not valid json
" is not valid JSON
$ echo $?
2
```

An unknown key in the file produces a warning (visible in `--format json`'s `warnings` array) rather than an error; it is ignored, not rejected.

## Inline suppression, without a config file at all

For a one-off, file-specific exception, skip `.setupdoctorrc` entirely and add a comment directly in the instruction file:

```markdown
<!-- doctor-ignore INS-04 -->
Always run migrations before deploying.
<!-- doctor-ignore INS-04, INS-05 -->
Multiple rule IDs, comma-separated, are also allowed.
```

This suppresses the named rule(s) for findings in that specific file only, the same way `disabledRules` does project-wide: excluded from the score, still counted and listed separately.

## What `.setupdoctorrc` does not yet do

Honestly, not everything in it is wired up yet. `agent`, `scope`, `theme` and `minSeverity` are accepted in the file (an unrecognized value still produces a warning, not silence) but are **not** currently used as defaults for the equivalent CLI flags: every command still falls back to its own hardcoded default (for example, `wrapped --agent` always defaults to `claude` regardless of what the file says) rather than reading the file's value when the flag is omitted. `disabledRules` and `thresholds`, the two fields that change what is actually found and scored, work as documented above. This gap is tracked in [`docs/notes.md`](../notes.md)'s backlog, not silently left undocumented; if you rely on any of those four fields today, pass the equivalent flag explicitly instead.
