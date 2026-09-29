# Troubleshooting

## "Nothing to check"

```
$ npx setup-doctor
Nothing to check. Use --agent to specify an agent or pass a path to a project.
```

This means no supported agent was detected, at either project or global scope. Check:

- You are running the command from (or pointing `--agent`'s path argument at) the right directory.
- The agent you expect is actually configured here: for Claude Code, at minimum a `CLAUDE.md` file, a `.claude/` directory, or `.mcp.json`; see [`agents.md`](agents.md) for the full per-agent list of what counts as "detected."
- You did not accidentally restrict `--scope` to `project` when your setup is global-only, or vice versa; the default, `--scope all`, checks both.

## The score seems wrong, or lower/higher than I expected

Start with `--format json` and read the `categories` array: each entry's `deductions` and `fraction` show exactly where points were lost, before any rounding. A few things that surprise people:

- **`n/a` categories are excluded, not zeroed.** If `Plugins` shows `n/a`, it is not counted against you; the remaining categories' weights are renormalized to fill the full 100 points. This is by design (Codex and Cursor genuinely have no plugin concept), not a bug.
- **A single critical finding caps the whole score at 74**, regardless of how good everything else is. If your score looks stuck below 75 despite few findings, look specifically for a `CRIT` one.
- **`(possible)` findings only ever cost half of what a certain finding of the same severity would.** They also require at least 14 days of session log coverage to appear at all; with less history, the rule stays silent rather than guessing from thin data.
- **`--min-severity` never changes the score**, only what is printed. If you filtered findings and the number on screen does not match what you remember, that is expected; drop the flag to see everything again.
- **A `.setupdoctorrc` in the project root is applied automatically.** If a rule you expect to see is missing, check for one; `npx setup-doctor rules` shows `ENABLED: no` for anything it disables.

## A specific finding seems wrong, or I don't understand it

Run `npx setup-doctor explain <RULE_ID>` for the rule's full reasoning, not just the one-line summary shown in a report:

```bash
npx setup-doctor explain INS-06
```

If a rule genuinely does not apply to how you work (for example, a stale-reference check flagging a path that is intentionally generated later in your build), either add an inline `<!-- doctor-ignore RULE-ID -->` comment to just that file, or disable it project-wide in [`.setupdoctorrc`](config.md): do not treat a mismatch as something to just ignore silently, since either mechanism keeps the suppression visible in every future report rather than hiding it.

## Files show up as "skipped"

The terminal summary line and the JSON report's `skipped` array list any file that existed but could not be read, along with why (a permissions error, for example). `setup-doctor` never crashes on unreadable input; it records the skip and continues rather than failing the whole run. If a file you expect to be audited keeps showing up here, check its permissions.

## PNG export says it needs an optional package

```
PNG needs the optional @resvg/resvg-js package (npm install @resvg/resvg-js). SVG was written.
```

`wrapped` always writes both SVG files regardless. PNG additionally needs the optional native `@resvg/resvg-js` dependency; install it if you need PNG specifically (for a platform that only accepts raster images, for example):

```bash
npm install @resvg/resvg-js
```

## A secret ended up in a report, or I'm worried one might

`setup-doctor` never prints a secret-like value it finds, only `[REDACTED]`, the rule ID, and the file/line it was found at. If you are about to share a **local** report file (the HTML report or JSON output, as opposed to the badge or the Wrapped card), read the reminder printed in its own footer first: local reports can still contain real file paths from your project, which the badge and the Wrapped card never do.

## I'm not sure which config file setup-doctor is actually reading

Every command that respects `.setupdoctorrc` supports `--config <path>` to point at a specific file explicitly, sidestepping any ambiguity about which project root it would otherwise look in. See [`config.md`](config.md).

## Something else

Check [`docs/notes.md`](../notes.md): it is the running log of every assumption, deviation from the original spec, and real bug found and fixed while building this tool, including exactly what was and was not verified against a real install for each supported agent. If your question is not answered there, [open an issue](https://github.com/saxenakapil/setup-doctor/issues).
