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

## `ignore`

Glob patterns (relative to the project root) for paths to exclude from discovery entirely, not merely from the findings list: an ignored path is never read, so it cannot leak a "secret" into a report or count toward the score, and it is never listed as "skipped" either, since it was never something the tool was trying to read in the first place.

```json
{
  "ignore": ["test/fixtures/**", "vendor/"]
}
```

Supported syntax (a deliberately small subset, not a full `.gitignore` implementation):

| Pattern | Matches |
| --- | --- |
| `*` | any characters within one path segment (not across a `/`) |
| `**` | any number of path segments, including zero |
| `?` | a single character within one path segment |
| a trailing `/` | shorthand for "everything under this directory" (same as adding `/**`) |

Patterns are anchored at the project root by default; only a pattern that itself starts with `**/` matches at any depth (`**/*.tmp` matches both `debug.tmp` at the root and `a/b/debug.tmp`, but a bare `fixtures/**` only matches a top-level `fixtures/` directory, not `examples/fixtures/`).

This is genuinely useful for any project with its own test fixtures, vendored code, or generated/example content that happens to contain intentionally-bad configuration (this project's own `.setupdoctorrc` uses `"ignore": ["test/fixtures/**"]` for exactly that reason: `test/fixtures/` is full of deliberately broken `CLAUDE.md`/`AGENTS.md` files written to trigger rules in unit tests, and without excluding it a self-audit of this repository would otherwise score itself against its own test data). It currently applies to nested instruction-file discovery (`CLAUDE.md`/`AGENTS.md` found in subdirectories) and project-scope skill/subagent folders; a small, separately-hardcoded list (`node_modules`, `.git`, `dist`, `build`, `.venv`, `vendor`, `.setupdoctor-backup`) is always skipped regardless of this setting and needs no configuration.

Like `disabledRules`, a CLI-level override (were one ever added) would win over the config file's value wholesale, not merge with it; there is currently no `--ignore` flag, only the config file.

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

## `agent`, `scope`, `theme` and `minSeverity` as flag defaults

These four fields now work as real defaults for the equivalent CLI flag, in the precedence this page already describes (flag, then `.setupdoctorrc`, then the built-in default):

```bash
$ cat .setupdoctorrc
{"agent": "claude", "theme": "technical", "minSeverity": "high"}
$ npx setup-doctor --scope project --format json
```

Runs exactly as if you had passed `--agent claude --theme technical --min-severity high`, without typing any of them: only `claude`'s own findings are checked, only `high`/`critical` findings are shown, and JSON/HTML/badge output uses the technical theme. An explicit flag still always wins over the file.

What each one applies to, matching the flags themselves: `agent` and `theme` apply to `doctor`, `badge` and `wrapped`; `scope` applies to `doctor` and `badge` only (`wrapped` has no `--scope` flag); `minSeverity` applies to `doctor` only. `wrapped` now also reads `.setupdoctorrc` (from the current directory, or `--config <path>`), which it did not do at all before this was wired up. `agent: "auto"` (the config file's spelling for "detect every agent present") is treated the same as `doctor`/`badge`'s own `--agent all` default; for `wrapped`, which always reads exactly one agent's session log, `"auto"` has no equivalent meaning and is ignored in favor of `wrapped`'s own `claude` default.

An unrecognized value for one of these four keys (for example `"theme": "neon"`) produces a warning identical in shape to an unknown key's warning, and that one field is dropped back to its built-in default rather than failing the run; the rest of the file still applies. `disabledRules` and `thresholds` are unaffected by any of this, they already worked as documented above.
