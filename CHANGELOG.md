# Changelog

All notable changes are listed here. The format follows Keep a Changelog and the project uses semantic versioning. The rule set has its own version (`rulesVersion`), listed separately below.

## 0.1.0 (unreleased)

Core product complete (Phases 1-6 of `docs/scope.md`).

- **Doctor**: full discovery and scoring for Claude Code (instructions, skills, subagents, MCP servers, plugins, settings/hooks) and partial discovery for Codex and Cursor (instructions, MCP servers — those agents have no skills/plugins/settings concept in v1). All 26 rules implemented. Terminal report, self-contained themed HTML report, JSON output, static and shields.io-endpoint badges.
- **Wrapped**: usage summary for Claude Code from local session logs (streaming JSONL parser, metrics, persona labels, price-table cost estimate), rendered as a shareable card in three themes and two sizes with optional PNG export. Codex and Cursor Wrapped report "not supported yet" — no documented, parseable local session-log source was found for either on real installs (see `docs/notes.md`).
- `--ci --fail-under` for CI score gates; `--theme`, `--min-severity`, `--out`, `--yes`, `--period`, `--tz`, `--anonymize`, `--no-cost`, `--show-projects`.
- Three bundled, subsetted, SIL-OFL-licensed fonts (Bricolage Grotesque, Figtree, JetBrains Mono), embedded as base64 in every themed output. No remote fonts.
- CI matrix (macOS, Windows, Linux x Node 20, 22), a privacy guard that fails the build on any network-capable import, and a version-sync check across `package.json`, `src/version.ts` and both plugin manifests.
- Fix mode (`--fix`, `docs/scope.md` section 14) is not yet implemented — stretch goal, Phase 8.

## Rule set

### 1.0.0

- Initial rule set: INS-01 to INS-08 (instructions), SKL-01 to SKL-06 (skills and subagents), MCP-01 to MCP-05 (MCP servers), PLG-01 to PLG-03 (plugins), SET-01 to SET-02 (settings and hooks), FRS-01 to FRS-02 (freshness). See `docs/rules.md` for the full specification of each rule.

## 0.0.1

- Placeholder release to claim the package name.
