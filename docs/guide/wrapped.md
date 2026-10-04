# Wrapped

`wrapped` summarizes your local session logs into a terminal report and a shareable card, similar to a year-in-review. It reads only files already on your machine and sends nothing.

```bash
npx setup-doctor wrapped                  # Claude Code (default)
npx setup-doctor wrapped --agent codex    # Codex
npx setup-doctor wrapped --agent copilot  # GitHub Copilot CLI
npx setup-doctor wrapped --agent cursor   # Cursor (requires Node 22.5 or later)
```

## Example output

This example uses the repository's own test fixtures, so you can reproduce it. The `--anonymize` flag hides project names.

```
Setup Doctor Wrapped  all time

Sessions 2   Active days 2   Tokens 2,020   Est. cost* $0.0070
Busiest hour 10:00   Busiest weekday Thursday   Longest streak 2 days
Cache hit rate 27%

Top models: claude-opus-5-5 (53%), claude-haiku-4-5 (40%), claude-sonnet-5 (7%)
Top tools: setup-doctor:doctor, Read, Bash, Edit

Persona: Marathoner. Your longest session ran past 4 hours.

* API-equivalent estimate, not your bill. Price table as of 2026-09-29.
Wrote setup-doctor-wrapped-1200x630.svg, setup-doctor-wrapped-1080x1350.svg
Wrote PNG versions (optional @resvg/resvg-js dependency found).
```

Each run writes two card files: a 1200x630 landscape and a 1080x1350 portrait. Both are SVG. PNG versions are written too when the optional `@resvg/resvg-js` package is installed. Otherwise the command prints a note.

## Agents

| Agent | Source of session data | Notes |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` | Full token and tool data. |
| Codex | `~/.codex/sessions/**/*.jsonl` | Tool names are Codex's own event types, such as `CommandExecution`. Codex creates its `sessions/` directory the first time a session runs. |
| GitHub Copilot CLI | `~/.copilot/session-state/<id>/events.jsonl` | Uses Copilot's own per-model totals, read from its session shutdown event. |
| Cursor | `state.vscdb` (SQLite) in Cursor's data directory | Requires Node 22.5 or later, because it uses the built-in `node:sqlite` module. |

On Cursor, cost shows `n/a`. Cursor bills through its own subscription and quota system, not a per-token API, so the tool does not estimate a dollar figure. Models outside the price table also show `n/a`, and the tool does not guess their price.

Busiest hour, busiest weekday and longest streak are computed per conversation on Cursor, because its local database does not reliably store a timestamp for every message.

On an older Node version, `wrapped --agent cursor` exits with a message that names your Node version.

## Periods

```bash
npx setup-doctor wrapped --period 7d
npx setup-doctor wrapped --period 30d                       # default
npx setup-doctor wrapped --period ytd
npx setup-doctor wrapped --period all
npx setup-doctor wrapped --period 2026-01-01:2026-03-15     # inclusive range
```

`--tz <IANA zone>` sets the time zone used for day boundaries, active days and the busiest hour. It defaults to your local time zone.

## Trend

```bash
npx setup-doctor wrapped --period 7d --trend
```

`--trend` compares the period with the one immediately before it, of the same length. It reports the change in sessions, active days, tokens and cost. Busiest hour, busiest weekday and persona describe only the current period, so they have no trend.

`--period all` covers all data, so it has no earlier period to compare against. `--trend` reports that and shows no delta.

`--format json` includes the same comparison in a `trend` field. It is present only with `--trend`, and is `null` when there is no earlier period.

The shareable card does not include trend data.

## Privacy

Project names never appear on the card unless you ask for them:

| Flag | Effect |
| --- | --- |
| *(default)* | Project names appear in your local terminal report only. |
| `--show-projects` | Also show project names on the card. |
| `--anonymize` | Hide project names everywhere, including your terminal report. |
| `--no-cost` | Remove the cost estimate from every output. |

The session parser reads only metadata: timestamps, model names, token counts and tool names. It discards message text as each line is read, so prompts never reach memory beyond the current line and never reach the card.

## Output formats

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
    "cost": { "totalUsd": 0.116, "hasUnknownModel": false, "perModel": [] },
    "topModels": [],
    "topTools": [],
    "topProjects": []
  },
  "persona": { "label": "Steady Builder", "line": "Steady, consistent use." }
}
```

`topProjects` is omitted unless you pass `--show-projects`, and is empty with `--anonymize`.

## Persona

The persona label, such as `Steady Builder`, `Night Owl`, `Marathoner`, `Cache Master` or `Streak Keeper`, is based on your usage pattern: consistency, time of day, session length and cache use. It is descriptive, not a score.

## Theme

```bash
npx setup-doctor wrapped --theme technical   # default
npx setup-doctor wrapped --theme playful
npx setup-doctor wrapped --theme mix
```

The three themes are described in [themes](../themes.md).

## Configuration

`wrapped` reads `.setupdoctorrc` for the `agent` and `theme` fields. Command-line flags always take precedence. See [configuration](config.md#precedence-and-flag-defaults).
