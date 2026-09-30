# `wrapped`: usage summary and shareable card

```bash
npx setup-doctor wrapped                    # Claude Code (default)
npx setup-doctor wrapped --agent codex      # Codex
npx setup-doctor wrapped --agent copilot    # GitHub Copilot CLI
npx setup-doctor wrapped --agent cursor     # Cursor (needs Node 22.5+)
```

Summarizes your local session logs into a terminal report plus a shareable SVG/PNG card, in the style of a "year in review." Supported for Claude Code (`~/.claude/projects/**/*.jsonl`), Codex (`~/.codex/sessions/**/*.jsonl`), GitHub Copilot CLI (`~/.copilot/session-state/<id>/events.jsonl`) and Cursor (`state.vscdb`, read via the built-in `node:sqlite` module, Node 22.5+ only); see [`agents.md`](agents.md) for what each one reads.

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

A real Copilot CLI run:

```
$ npx setup-doctor wrapped --agent copilot --period all --anonymize
Setup Doctor Wrapped  all time

Sessions 3   Active days 2   Tokens 246,390   Est. cost* $0.0065
Busiest hour 15:00   Busiest weekday Sunday   Longest streak 1 day
Cache hit rate 34%

Top models: mai-code-1.1-flash (69%), gpt-6-luna (31%)
Top tools: bash

Persona: Steady Builder. Steady, consistent use.

* API-equivalent estimate, not your bill. Price table as of 2026-09-29.
  One or more models are not in the price table; their cost shows as n/a.
```

Copilot's own CLI already aggregates token usage per model for you (visible in its own terminal output as "AI Credits" and a token count), so unlike Claude Code and Codex, this parser never sums anything itself: it reads Copilot's own final per-model totals from the session's `session.shutdown` event once. A model outside the price table (like `mai-code-1.1-flash` here) shows as `n/a`, the same "not guessed at" behavior as Cursor's `default`.

A real Cursor run, on Node 22.5+:

```
$ npx setup-doctor wrapped --agent cursor --period all --anonymize
Setup Doctor Wrapped  all time

Sessions 5   Active days 6   Tokens 1,020,558   Est. cost* n/a
Busiest hour 06:00   Busiest weekday Tuesday   Longest streak 1 day
Cache hit rate 0%

Top models: default (100%)
Top tools: search_replace, edit_file_v2, read_file_v2, run_terminal_cmd, read_file

Persona: Night Owl. Most of your messages land after dark.

* API-equivalent estimate, not your bill. Price table as of 2026-09-29.
  One or more models are not in the price table; their cost shows as n/a.
```

Two things are genuinely different about Cursor here, not bugs: cost shows `n/a` because Cursor's own model names (`default`, `gpt-5`, and so on, whatever Cursor's own settings have you on) are not in the price table and are not guessed at (Cursor bills through its own subscription/quota system, not a metered per-token API the way Codex does); and `Busiest hour`/`Busiest weekday`/`Longest streak` are computed at one timestamp per conversation, not per message, since Cursor's own local database does not reliably carry a per-message timestamp for anything but the shortest conversations. Every other number (sessions, tokens, tools, persona) is per-message real data, the same as Claude Code and Codex.

Before Node 22.5, `wrapped --agent cursor` prints why instead of running (illustrative, since this machine runs Node 22 and cannot produce it directly):

```
$ npx setup-doctor wrapped --agent cursor
Wrapped for cursor needs Node 22.5 or later (it reads Cursor's local database via the built-in node:sqlite module).
Your Node version: v20.x.x
```

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

## `--trend`: this period vs the last one

```bash
npx setup-doctor wrapped --period 7d --trend
```

```
$ npx setup-doctor wrapped --period 7d --trend --anonymize
Setup Doctor Wrapped  7 days

Sessions 2   Active days 8   Tokens 1,456,881,790   Est. cost* $531.96
Trend vs previous 7 days: Sessions (-1)   Active days (no change)   Tokens (+798,529,767)   Est. cost* (+$123.65)
Busiest hour 11:00   Busiest weekday Tuesday   Longest streak 8 days
...
```

Compares the chosen `--period` against the immediately preceding window of the same length (the previous 7 days, the previous 30 days, and so on) -- read from local session logs already on disk, so no separate history file is kept the way `doctor --compare`'s score history is. Only the headline numbers get a delta (sessions, active days, tokens, cost): busiest hour, busiest weekday and the persona are point-in-time facts about the current period, not something that has a meaningful "change since last time." `--period all` has no well-defined previous period (it already covers everything), so `--trend` there just says so instead of showing a delta. `--format json` gets the same comparison as a `trend` field (present only when `--trend` was passed; `null` when not applicable) instead of the printed line. The shareable card itself does not show trend -- it stays exactly what `--trend`-less runs already produce.

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
npx setup-doctor wrapped --theme technical   # default
npx setup-doctor wrapped --theme playful
npx setup-doctor wrapped --theme mix
```

Same three themes as `doctor --format html` and `badge` (whose own default stays `playful`); see [`docs/themes.md`](../themes.md) for the full design token reference if you want to understand exactly what each one changes.
