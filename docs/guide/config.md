# Configuration

`setup-doctor` reads an optional `.setupdoctorrc` file from the project root. No flag is needed.

```json
{
  "agent": "claude",
  "minSeverity": "medium",
  "disabledRules": ["FRS-01"],
  "thresholds": {
    "SKL-02": { "minChars": 40 }
  },
  "ignore": ["test/fixtures/**", "vendor/"]
}
```

## Fields

| Field | Type | Applies to | Description |
| --- | --- | --- | --- |
| `agent` | `claude`, `codex`, `cursor`, `copilot`, `auto` | doctor, badge, wrapped | Default for `--agent`. `auto` means detect all agents. |
| `scope` | `project`, `global`, `all` | doctor, badge | Default for `--scope`. |
| `theme` | `playful`, `technical`, `mix` | doctor, badge, wrapped | Default for `--theme`. |
| `minSeverity` | `low`, `medium`, `high`, `critical` | doctor | Default for `--min-severity`. |
| `disabledRules` | array of rule IDs | doctor, badge | Rules to disable for this project. IDs are case-insensitive. |
| `thresholds` | object | doctor, badge | Numeric limits for individual rules. See below. |
| `ignore` | array of glob patterns | doctor, badge | Paths to exclude from discovery. See below. |

Setting `minSeverity` in the file does not change the score, just like the flag.

## Precedence and flag defaults

Values are resolved in this order:

1. A command-line flag
2. `.setupdoctorrc`
3. The built-in default

A flag always wins over the file. Invalid values are not fatal. An unrecognized value for `agent`, `scope`, `theme` or `minSeverity` produces a warning and the built-in default is used for that field. The rest of the file still applies.

## Disabling rules

```bash
npx setup-doctor rules
```

The `ENABLED` column shows which rules are active. Add a rule ID to `disabledRules` to turn it off for the project:

```json
{ "disabledRules": ["FRS-01", "SET-01"] }
```

Disabled rules are not counted in the score. Their findings are listed under `suppressed` in JSON output, so a project-wide disable is always visible.

## Thresholds

Some rules have tunable numbers:

| Rule | Field | Default | Meaning |
| --- | --- | --- | --- |
| `INS-02` | `warnTokens`, `highTokens` | 2000, 5000 | Instruction file size, in tokens, for medium and high severity. |
| `INS-03` | `diceThreshold`, `minLineChars` | 0.9, 20 | Similarity above which two lines count as duplicates, and the minimum line length checked. |
| `INS-04` | `jaccardThreshold` | 0.6 | Word overlap above which two rules may contradict each other. |
| `SKL-02` | `minChars`, `maxChars` | 20, 500 | Skill description length limits, in characters. |
| `SKL-03` | `jaccardThreshold` | 0.6 | Word overlap above which two skill descriptions overlap. |
| `SKL-04` | `maxLines` | 500 | Maximum length of a skill file, in lines. |
| `MCP-04` | `maxServers` | 8 | Number of enabled MCP servers before the rule fires. |

Only the fields you set change. Other fields keep their defaults:

```json
{ "thresholds": { "MCP-04": { "maxServers": 12 } } }
```

## Ignoring paths

`ignore` excludes paths from discovery. An ignored path is never read, so it cannot add findings, leak a value into a report, or count toward the score. It is also not listed as skipped.

```json
{ "ignore": ["test/fixtures/**", "vendor/", "**/*.tmp"] }
```

| Pattern | Matches |
| --- | --- |
| `*` | Any characters within one path segment. Does not cross `/`. |
| `**` | Any number of path segments, including none. |
| `?` | One character within one path segment. |
| Trailing `/` | Everything under that directory. Same as adding `/**`. |

Patterns are anchored at the project root. Only a pattern that starts with `**/` matches at any depth. For example, `fixtures/**` matches `fixtures/` at the root but not `examples/fixtures/`.

Ignore applies to nested instruction files (such as `CLAUDE.md` in a subdirectory) and to project-scope skill and subagent folders. These directories are always skipped, regardless of configuration: `node_modules`, `.git`, `dist`, `build`, `.venv`, `vendor` and `.setupdoctor-backup`.

This repository uses `"ignore": ["test/fixtures/**"]` because its test fixtures contain intentionally broken configuration files.

## Inline suppression

For one exception in one file, add a comment to the file itself:

```markdown
<!-- doctor-ignore INS-04 -->
Always run migrations before deploying.
<!-- doctor-ignore INS-04, INS-05 -->
```

The named rules are suppressed for findings in that file only. Suppressed findings are excluded from the score and listed under `suppressed`.

## Using a different configuration file

```bash
npx setup-doctor --config ./configs/strict.json
```

`--config` replaces the default `<project>/.setupdoctorrc` lookup. This is useful in a monorepo with different rules per package, or for a shared configuration.

## Invalid configuration

Invalid JSON is a usage error. The command exits with code 2 and does not fall back to defaults:

```
Invalid JSON in /path/to/project/.setupdoctorrc: Unexpected token 'o', "not valid json
" is not valid JSON
```

An unknown key produces a warning in the `warnings` array of JSON output. It is ignored, not rejected.
