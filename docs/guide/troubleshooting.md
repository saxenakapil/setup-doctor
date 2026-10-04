# Troubleshooting

## "Unknown option"

```
$ npx setup-doctor --bogus
Unknown option: --bogus
Run setup-doctor --help for usage.
```

The flag is not one `setup-doctor` accepts. Check the spelling against `setup-doctor --help`. Flags may come before or after the command: `npx setup-doctor --ci --fail-under 75` and `npx setup-doctor doctor --ci --fail-under 75` are equivalent.

## "Nothing to check"

```
Nothing to check. Use --agent to specify an agent or pass a path to a project.
```

No supported agent configuration was found at project or global scope. Check the following:

- Run the command from the project directory, or pass the directory as an argument: `npx setup-doctor doctor /path/to/project`.
- The agent's configuration exists. For Claude Code, that means at least one of `CLAUDE.md`, a `.claude/` directory or `.mcp.json`. The [agents](agents.md) page lists what each agent needs.
- `--scope` matches where your configuration lives. The default `all` checks both project and global locations.

## The score is lower or higher than expected

Start with the JSON output. The `categories` array shows the deductions for each category before rounding:

```bash
npx setup-doctor doctor --format json | less
```

Common causes:

- **A category shows `n/a`.** It is excluded from the score and the remaining weights are scaled up. It is not counted as a failure.
- **A critical finding caps the score at 74.** If the score stays below 75 with few findings, look for a `CRIT` finding.
- **A `(possible)` finding costs half as much as a certain finding of the same severity.** Possible findings also need at least 14 days of session logs.
- **`--min-severity` does not change the score.** It only changes which findings are shown.
- **A `.setupdoctorrc` file applies automatically.** `npx setup-doctor rules` shows which rules are disabled.

## A finding seems wrong

Read the full explanation for the rule:

```bash
npx setup-doctor explain INS-06
```

If the rule does not apply to your project, suppress it. Add a comment to the specific file:

```markdown
<!-- doctor-ignore INS-06 -->
```

Or disable the rule for the project in [`.setupdoctorrc`](config.md). Either way the suppression remains visible in the report.

## Files appear as "skipped"

The `skipped` array in JSON output, and the summary in the terminal, lists files that exist but could not be read, with the reason. The command continues past them. Check the file's permissions.

## Configuration file errors

```
Invalid JSON in /path/to/project/.setupdoctorrc: ...
```

The command exits with code 2. Fix the JSON syntax. An unknown key only produces a warning. See [configuration](config.md).

To check which configuration file is being used, pass it explicitly with `--config`:

```bash
npx setup-doctor doctor --config ./.setupdoctorrc
```

## PNG export needs an optional package

```
PNG needs the optional @resvg/resvg-js package (npm install @resvg/resvg-js). SVG was written.
```

`wrapped` always writes SVG cards. PNG export additionally needs the optional `@resvg/resvg-js` package:

```bash
npm install @resvg/resvg-js
```

## Reports and secrets

Secret values are never printed. Findings show the rule, the file, the line and `[REDACTED]`.

Local reports, meaning HTML and JSON files, can contain file paths from your project. The HTML report reminds you of this in its footer. Review a report before you share it. The badge and the Wrapped card never contain file paths.

## Something else

- [Decision log](../notes.md) records assumptions, deviations and fixes, including what was verified against real installs of each agent.
- [Open an issue](https://github.com/saxenakapil/setup-doctor/issues) for anything not covered here.
