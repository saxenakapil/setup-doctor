# `wrapped`: usage summary and shareable card

```bash
npx setup-doctor wrapped                    # Claude Code (default)
npx setup-doctor wrapped --agent codex      # Codex
```

Summarizes your local session logs into a terminal report plus a shareable SVG/PNG card, in the style of a "year in review." Supported for Claude Code (`~/.claude/projects/**/*.jsonl`) and Codex (`~/.codex/sessions/**/*.jsonl`); see [`agents.md`](agents.md) for why Copilot and Cursor are not supported yet.

A real run (against a small synthetic dataset, not anyone's real usage) looks like this:

```
Setup Doctor Wrapped  30 days

Sessions 16   Active days 12   Tokens 47,065   Est. cost* $0.12
Busiest hour 10:00   Busiest weekday Sunday   Longest streak 5 days
Cache hit rate 58%

Top models: claude-opus-5-5 (37%), claude-haiku-4-5 (31%), claude-sonnet-5 (31%)
Top tools: Edit, Write, Grep, Read, Bash
Top projects: demo-project (47,065 tok)

Persona: Steady Builder. Steady, consistent use.

* API-equivalent estimate, not your bill. Price table as of 2026-09-29.
Wrote setup-doctor-wrapped-1200x630.svg, setup-doctor-wrapped-1080x1350.svg
Wrote PNG versions (optional @resvg/resvg-js dependency found).
```

A real Codex run looks the same shape, with Codex's own model names and tool labels:

```
$ npx setup-doctor wrapped --agent codex --period all
Setup Doctor Wrapped  all time

Sessions 2   Active days 1   Tokens 104,945   Est. cost* $0.0066
Busiest hour 16:00   Busiest weekday Tuesday   Longest streak 1 day
Cache hit rate 42%

Top models: gpt-6-luna (100%)
Top tools: CommandExecution
Top projects: /private/tmp/codex-test-project (52,781 tok), /private/tmp/codex-test2 (52,164 tok)

Persona: Steady Builder. Steady, consistent use.
```

Codex's "top tools" are its own event types (`CommandExecution`, and others as they show up in real usage), not Claude Code's tool names (`Bash`, `Edit`, and so on): the two agents don't share a vocabulary here, so do not expect the same labels across agents.

Two card files are always written (a 1200x630 landscape and a 1080x1350 portrait, matched to common social-share dimensions), as SVG always and as PNG too if the optional `@resvg/resvg-js` package is installed. Without it, you still get both SVGs and a note telling you PNG needs the optional package.

## `--period`: which window to summarize

```bash
npx setup-doctor wrapped --period 7d     # last 7 days
npx setup-doctor wrapped --period 30d    # default
npx setup-doctor wrapped --period ytd    # year to date
npx setup-doctor wrapped --period all    # everything on disk
npx setup-doctor wrapped --period 2026-01-01:2026-03-15   # a specific range, inclusive
```

`--tz <IANA zone>` controls which day boundaries "active days" and "busiest hour" use (default: your local timezone). Useful if you work across timezones and want a consistent report regardless of where you run it from.

## Privacy flags: what shows up in a shareable card

By default, **project names never appear on the card**, only in your own local terminal report. This is deliberate, not an oversight: the card is meant to be posted publicly.

```bash
npx setup-doctor wrapped --show-projects   # opt in: put project names on the card too
npx setup-doctor wrapped --anonymize       # hide project names everywhere, including your own terminal
npx setup-doctor wrapped --no-cost         # remove the cost estimate entirely
```

```
$ npx setup-doctor wrapped --anonymize
Setup Doctor Wrapped  30 days

Sessions 16   Active days 12   Tokens 47,065   Est. cost* $0.12
...
Top models: claude-opus-5-5 (37%), claude-haiku-4-5 (31%), claude-sonnet-5 (31%)
Top tools: Edit, Write, Grep, Read, Bash

Persona: Steady Builder. Steady, consistent use.
```

Notice `Top projects` is gone from this output entirely, not just redacted.

The underlying session parser only ever reads metadata (timestamps, model name, token counts, tool names) and drops message text line by line as it reads, so prompt content is never held in memory beyond the current line, let alone written to the card.

## `--format json`

```bash
npx setup-doctor wrapped --format json
```

```json
{
  "schemaVersion": 1,
  "period": { "kind": "30d", "tz": "UTC" },
  "periodLabel": "30 days",
  "metrics": {
    "recordCount": 32,
    "sessions": 16,
    "activeDays": 12,
    "longestStreakDays": 5,
    "tokens": { "input": 14310, "output": 5555, "cacheRead": 24000, "cacheWrite": 3200 },
    "cacheHitRate": 0.578,
    "cost": { "totalUsd": 0.116, "hasUnknownModel": false, "perModel": [ /* one entry per model */ ] },
    "topModels": [ /* ... */ ],
    "topTools": [ /* ... */ ],
    "topProjects": [ /* omitted unless --show-projects, empty if --anonymize */ ]
  },
  "persona": { "label": "Steady Builder", "line": "Steady, consistent use." }
}
```

## The persona label

A short label (`Steady Builder`, `Night Owl`, `Marathoner`, and others) derived from your usage pattern: consistency, time of day, session length. It is meant to be a fun, honest reflection of how you actually work, not a score or a judgment.

## `--theme`

```bash
npx setup-doctor wrapped --theme playful     # default
npx setup-doctor wrapped --theme technical
npx setup-doctor wrapped --theme mix
```

Same three themes as `doctor --format html` and `badge`; see [`docs/themes.md`](../themes.md) for the full design token reference if you want to understand exactly what each one changes.
