# setup-doctor

Score and improve your AI coding agent setup. Local-only, open source, free.

[![Setup Doctor score](https://img.shields.io/badge/setup%20doctor-92%20Excellent-brightgreen)](#badge)

> `setup-doctor` audits how [Claude Code](https://claude.com/claude-code) (and, for a subset of checks, Codex and Cursor) is configured in your project and globally, gives it a 0-100 score with concrete fixes, and turns your local usage logs into a shareable "Wrapped" card. Everything runs on your machine. Nothing is ever sent anywhere.

<!-- Demo GIF: `npx setup-doctor doctor` running in a terminal, showing the score, category breakdown and top findings. Replace this comment with the real asset once recorded. -->
<!-- ![Setup Doctor demo](docs/examples/demo.gif) -->

## What it does

- **Doctor** — audits instruction files (`CLAUDE.md` / `AGENTS.md` / `.cursorrules`), skills, subagents, MCP servers, plugins, settings and hooks. Runs 26 rules across 6 categories and returns a score, a band (Excellent / Good / Needs work / Poor), and a specific fix for every finding.
- **Wrapped** — summarizes your local Claude Code session logs (sessions, active days, tokens, an API-equivalent cost estimate, streaks, busiest hour, a persona label) into a shareable card, in three visual themes and two sizes, with optional PNG export.
- **Badge** — a static or live (shields.io endpoint) README badge showing your current score.
- **HTML report** — a single self-contained, themed report file. No network requests, strict Content-Security-Policy, everything inlined.

## Supported agents

| Agent | Doctor | Wrapped |
| --- | --- | --- |
| [Claude Code](https://claude.com/claude-code) | Full (all 26 rules) | Supported |
| [Codex](https://developers.openai.com/codex) | Instructions + MCP rules | Not supported yet (no documented, parseable local session-log source was found — see [`docs/notes.md`](docs/notes.md)) |
| [Cursor](https://cursor.com) | Instructions + MCP rules | Not supported yet (same reason) |

Skills, subagents, plugins, settings and hooks checks are Claude Code-specific; those categories are simply excluded from the score for Codex/Cursor-only setups rather than counted against you.

## Install and run

No install needed — run it with `npx`:

```bash
npx setup-doctor                        # audit the current project (terminal report)
npx setup-doctor doctor --format html   # self-contained HTML report
npx setup-doctor badge                  # write a README badge
npx setup-doctor wrapped --period 30d   # usage summary + shareable card
npx setup-doctor rules                  # list all 26 rules
npx setup-doctor explain INS-02         # explain what a rule checks and how to fix it
```

Or install the [Claude Code plugin](https://docs.claude.com/en/docs/claude-code/plugins) from this repository's marketplace, which exposes `/setup-doctor:doctor` and `/setup-doctor:wrapped` as skills that call the same CLI.

### Common flags

| Flag | Applies to | What it does |
| --- | --- | --- |
| `--agent claude\|codex\|cursor\|all` | all | Which agent setup to read (default: auto-detect) |
| `--scope project\|global\|all` | doctor | Which locations to check |
| `--format terminal\|json\|html` | doctor | Output format |
| `--theme playful\|technical\|mix` | doctor --format html, badge, wrapped | Visual theme (default `playful`) |
| `--min-severity low\|medium\|high\|critical` | doctor | Hide findings below this level (score is unaffected) |
| `--ci --fail-under <n>` | doctor | Exit 1 if the score is below `n`, for CI gates |
| `--period 7d\|30d\|ytd\|all\|YYYY-MM-DD:YYYY-MM-DD` | wrapped | Time window (default `30d`) |
| `--anonymize` / `--show-projects` | wrapped | Hide project names everywhere / show them on the card (default hidden) |
| `--no-cost` | wrapped | Remove cost figures |
| `--out <path>` / `--yes` | doctor, badge, wrapped | Output folder / overwrite existing files without asking |

Run `npx setup-doctor --help` for the full list.

## Badge

```md
![Setup Doctor score](https://img.shields.io/badge/setup%20doctor-92%20Excellent-brightgreen)
```

`npx setup-doctor badge` writes `setup-doctor-badge.svg` and prints this snippet with your real score. Pass `--endpoint` to also write a shields.io [endpoint JSON](https://shields.io/badges/endpoint-badge) file — see [`docs/examples/badge-workflow.yml`](docs/examples/badge-workflow.yml) for a GitHub Actions workflow that publishes a live badge from your own CI. [`docs/examples/ci-gate-workflow.yml`](docs/examples/ci-gate-workflow.yml) shows using `--ci --fail-under` to block a PR on a low score.

## Privacy

- **No network calls at runtime.** No telemetry, no update checks, no remote fonts or scripts in any output — enforced by an automated check in CI (`scripts/check-no-network.mjs`).
- **Read-only** on your agent configuration and session logs, everywhere except the optional, not-yet-shipped `--fix` mode, which previews a diff, asks for confirmation, and saves a backup before touching anything.
- **Secret-like values are never printed.** Findings report the rule and location only; the value always shows as `[REDACTED]`.
- **The Wrapped card and the badge contain aggregate numbers only** — no prompts, file paths, usernames or repo names. Project names appear only if you pass `--show-projects`, and `--anonymize` hides them everywhere, including the local report.
- **The session log parser reads metadata only** (timestamps, model, token counts, tool names) and drops message text as each line is read — it is never held in memory beyond the current line.
- Local reports (the HTML report, JSON output) can still contain real file paths from your project; a footer in the HTML report reminds you of that before you share it.

## Docs

- [`docs/scope.md`](docs/scope.md) — the frozen v1 scope, data model, outputs and build plan
- [`docs/rules.md`](docs/rules.md) — every rule, with detection logic, severity and fix text
- [`docs/themes.md`](docs/themes.md) — the three visual themes' design tokens and layouts
- [`docs/notes.md`](docs/notes.md) — assumptions, deviations from the spec, and decisions made while building (including everything verified against real Claude Code / Codex / Cursor installs)

## Development

```bash
npm install          # first time; commit package-lock.json
npm run typecheck     # tsc --noEmit
npm test              # vitest
npm run check          # typecheck + tests + privacy guard + version sync (run before every commit)
npm run build          # bundles src/bin.ts to dist/bin.js
```

The repository must stay public — Claude Code's plugin marketplace and Cowork are reported not to sync private repositories.

## License

MIT. See [`LICENSE`](LICENSE). Bundled font licenses (SIL Open Font License 1.1) are in [`src/data/fonts/LICENSES.md`](src/data/fonts/LICENSES.md).
