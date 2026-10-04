# Changelog

All notable changes are listed here. The format follows Keep a Changelog and the project uses semantic versioning. The rule set has its own version (`rulesVersion`), listed separately below.

## Unreleased

- **`setup-doctor diff <before.json> <after.json>`**: explains how the score moved between two saved `doctor --format json` reports, listing new findings, resolved findings, and the score change with its band transition. A finding is matched by rule, file and message, so a line shift in an unchanged file does not appear as a change. Warns when the rule set changed between the two reports.
- **Generic instruction files**: `.windsurfrules` and `.clinerules` at the project root are now audited with the instruction rules (INS-01 to INS-08 and FRS-01), auto-detected as "Other agent". Skills, MCP, settings and Wrapped are not modeled for these agents. `AGENTS.md` stays with the Codex adapter, so it is never reported twice.
- **New rule MCP-06** (rules 1.2.0): flags an MCP server whose launcher (`npx`, `uvx`, `bunx`, `pipx`) runs a package without an exact version, such as `npx pkg` or `npx pkg@latest`. The Claude plugin directory reviewer raised the same risk for our own skills. Medium severity, not auto-fixable. See `docs/notes.md`.

- **Wrapped cost projection**: for periods shorter than a month, the terminal report shows the monthly rate beside the estimated cost (for example `Est. cost* $390.20 (about $1672.28/month at this rate)`). Projections need at least 3 elapsed days, and are omitted for periods of a month or longer, where the total already shows the spend.

## 0.3.2 (2026-10-02)

- Adds `mcpName` to `package.json` (`io.github.saxenakapil/setup-doctor`), the ownership-verification field the official MCP Registry checks for npm packages. No behavior change; this is metadata only, for the registry submission.

## 0.3.1 (2026-09-30)

- **`wrapped`'s default theme is now `technical`** (was `playful`), now that its card design has been rebuilt to an exact spec. `doctor --format html` and `badge` keep `playful` as their default; pass `--theme playful` or `--theme mix` to `wrapped` for the previous look.

## 0.3.0 (2026-09-30)

- **Technical theme Wrapped card, rebuilt to an exact design spec.** New bespoke SVG renderer (glass stat cards, a persona/activity panel pair, a quartile-leveled activity grid with a streak ring), replacing the technical theme's previous generic layout. Adds a quartile-based activity strip alongside the existing max-relative one (used unchanged by the playful/mix themes), and a cache-hit-rate stat card. See `docs/design/wrapped-technical/` for the frozen design reference.
- Persona line for Cache Master shortened (`docs/scope.md` section 11.5): "Your cache did the heavy lifting."

## 0.2.0 (2026-09-29)

- **GitHub Action: PR score-change comment.** A new `docs/examples/pr-comment-workflow.yml` scores a pull request's base and head directly in the same job (a real `git worktree` checkout, not a cached score) and posts or updates a single PR comment with the delta. Also fixed a real bug in the already-shipped score-history CI example: a fixed `actions/cache` key only ever saves once, so history silently stopped growing after its first run.
- **MCP server mode** (`mcp` command): exposes `doctor` and `wrapped` as read-only tools over stdio for Claude Desktop and other MCP clients, reusing the same `runDoctor()`/`runWrapped()` the CLI already uses. No `--fix` equivalent. Two new runtime dependencies (`@modelcontextprotocol/sdk`, `zod`), kept external to `dist/bin.js` rather than bundled.
- **`.setupdoctorrc`'s new `ignore` field**: glob patterns (relative to the project root) to exclude paths from discovery entirely, not just from the findings list. Applies to nested instruction-file discovery and project-scope skill/subagent folders. See [`docs/guide/config.md`](docs/guide/config.md).
- **Cursor skills** (`skills-cursor/`): the same `doctor` and `wrapped` skills already shipped for the Claude Code plugin, adapted and ready to copy into `.cursor/skills/`. See [`docs/guide/cursor-skills.md`](docs/guide/cursor-skills.md).
- **Homebrew tap**: `brew install saxenakapil/setup-doctor/setup-doctor`, from the separate [`saxenakapil/homebrew-setup-doctor`](https://github.com/saxenakapil/homebrew-setup-doctor) repository. Tracks new npm releases automatically via a daily autobump check.
- **GitHub Marketplace Action**: [`saxenakapil/setup-doctor-action@v1`](https://github.com/saxenakapil/setup-doctor-action), a composite Action wrapping `doctor --ci`, with CLI flags mapped to Action inputs and `score`/`band` exposed as outputs. See [`docs/guide/ci-integration.md`](docs/guide/ci-integration.md).

## 0.1.0 (2026-09-29)

First real release (0.0.1 was a placeholder to claim the package name; see below). Covers v1 scope (Phases 1-8 of `docs/scope.md`) plus everything built since.

### v1 scope

- **Doctor**: full discovery and scoring for Claude Code (instructions, skills, subagents, MCP servers, plugins, settings/hooks), partial discovery for GitHub Copilot CLI (instructions, skills, MCP servers, settings/hooks -- no plugin concept), and partial discovery for Codex and Cursor (instructions, MCP servers -- those agents have no plugins/settings concept in this tool's scope). All 26 v1 rules implemented (29 as of this release; see Rule set 1.1.0 below). A project reading from a file two agents share (Copilot CLI is documented to read several of Claude Code's own files directly) is scored once per real problem, not once per agent; the report notes which other agent it also affects. Terminal report (with ANSI color, respecting `NO_COLOR`/`--no-color`/`--ci`/non-TTY), self-contained themed HTML report, JSON output, static and shields.io-endpoint badges.
- **Wrapped**: usage summary for Claude Code from local session logs (streaming JSONL parser, metrics, persona labels, price-table cost estimate), rendered as a shareable card in three themes and two sizes with optional PNG export.
- **Fix mode** (`--fix`, `docs/scope.md` section 14): proposes safe, mechanical fixes with a diff preview, a backup before writing, and a confirmation requirement (`--yes`); `--dry-run` and `--allow-dirty` supported.
- `--ci --fail-under` for CI score gates; `--theme`, `--min-severity`, `--out`, `--yes`, `--period`, `--tz`, `--anonymize`, `--no-cost`, `--show-projects`, `--no-color`.
- Three bundled, subsetted, SIL-OFL-licensed fonts (Bricolage Grotesque, Figtree, JetBrains Mono), embedded as base64 in every themed output. No remote fonts.
- CI matrix (macOS, Windows, Linux x Node 20, 22), a privacy guard that fails the build on any network-capable import, a version-sync check across `package.json`, `src/version.ts` and both plugin manifests, an em-dash guard, and a real publish smoke test (pack, install the tarball, run the installed bin).

### Since v1 scope

- **GitHub Copilot CLI**: full Doctor adapter (instructions, skills, MCP servers, settings/hooks) and Wrapped support, including dedup for files it shares directly with Claude Code (`.claude/skills`, `.claude/settings.json`, the portable `.mcp.json`).
- **Cursor**: Wrapped support (reads `state.vscdb` via the built-in `node:sqlite` module, Node 22.5+ only), and Doctor project-scope skills auditing (`.cursor/skills/*/SKILL.md`, reusing the existing SKL-01 to SKL-05 rules).
- **`.setupdoctorrc`**: `agent`/`scope`/`theme`/`minSeverity` now act as real CLI flag defaults, not just documentation.
- **Score history and regression detection**: `--ci` appends to a local `.setupdoctor-history.jsonl`; `--compare` prints the delta since the last run, and with `--ci` also fails on any drop.
- **SET-02 fix mode**: removes a hook pointing to a missing or non-executable script, via a real structural JSON edit (not line-based text surgery) with a round-trip formatting-fidelity safety gate.
- **`wrapped --trend`**: compares the current `--period` against the immediately preceding period of the same length (sessions, active days, tokens, cost).
- **`.pre-commit-hooks.yaml`**: a real manifest for the [pre-commit](https://pre-commit.com) framework, so any repo can use this one as a hook source.
- **User guide** (`docs/guide/`): eight pages covering every command with real, captured output.

## Rule set

### 1.1.0

- Three new settings/hooks rules, post-v1: SET-03 (a hook shells out to a network tool: curl, wget, nc, ncat, ssh, scp, rsync or telnet), SET-04 (a deny rule blanket-blocks all Bash commands, e.g. `Bash(*)`, likely blocking legitimate work too), SET-05 (a hook command references a secret-like environment variable, e.g. `$GITHUB_TOKEN`, which hook output capture could leak into logs; `possible`, capped scoring impact). `docs/rules.md` documents the frozen v1 rule set only; see `docs/notes.md` for these three rules' full detection logic.

### 1.0.0

- Initial rule set: INS-01 to INS-08 (instructions), SKL-01 to SKL-06 (skills and subagents), MCP-01 to MCP-05 (MCP servers), PLG-01 to PLG-03 (plugins), SET-01 to SET-02 (settings and hooks), FRS-01 to FRS-02 (freshness). See `docs/rules.md` for the full specification of each rule.

## 0.0.1

- Placeholder release to claim the package name.
