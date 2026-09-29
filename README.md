# setup-doctor

Score and improve your AI coding agent setup. Local-only, open source.

> Status: in development. The name is claimed on npm (0.0.1 placeholder). The tool is being built from `docs/scope.md`.

## What it will do

- **Doctor:** audits your `CLAUDE.md`, skills, MCP servers, plugins, settings and hooks. Gives a 0 to 100 score, a list of findings and a concrete fix for each.
- **Wrapped:** turns your local session logs into a shareable usage card (sessions, tokens, estimated cost, streaks, busiest hours).
- **Badge:** a README badge that shows your setup score.
- **Themes:** `playful` (default), `technical` and `mix`.

## Planned usage

```bash
npx setup-doctor                     # audit this project and your global setup
npx setup-doctor doctor --format html
npx setup-doctor badge
npx setup-doctor wrapped --period 30d
npx setup-doctor explain INS-04
```

## Privacy

- No network calls at runtime. No telemetry. No accounts.
- Read-only by default. The optional fix mode shows a diff, asks first and saves a backup.
- The Wrapped card and the badge contain aggregate numbers only. No prompts, code, file paths or project names (unless you opt in).
- Secret-like values found in files are never printed.

## Docs

- [`docs/scope.md`](docs/scope.md): the frozen v1 scope and build plan
- [`docs/rules.md`](docs/rules.md): every rule, with detection logic and examples
- [`docs/themes.md`](docs/themes.md): the three visual themes

## Development

```bash
npm install
npm run check    # typecheck, tests, privacy guard, version sync
npm run build
```

## License

MIT
