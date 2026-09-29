# Supported agents

| Agent | Doctor | Wrapped |
| --- | --- | --- |
| Claude Code | Full (all 26 rules) | Supported |
| Codex | Instructions + MCP servers only | Supported |
| GitHub Copilot CLI | Instructions, skills, MCP servers, settings/hooks (no plugin concept) | Not supported yet |
| Cursor | Instructions + MCP servers only | Not supported yet |

Skills, subagents, plugins and settings/hooks checks are Claude Code/Copilot-specific; those categories are excluded from the score for Codex/Cursor-only setups (shown as `n/a` in the category breakdown), not counted against you as if they were failing.

## What each agent reads

**Claude Code**: `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md` (project), `~/.claude/CLAUDE.md` (global), nested `CLAUDE.md` files in subdirectories, `@import` references resolved; `.claude/skills/*/SKILL.md` and `.claude/agents/*.md` (project and global); `.mcp.json` (project, `mcpServers` key) and `~/.claude.json` (global); `.claude/settings.json` and `.claude/settings.local.json` for hooks and permissions.

**GitHub Copilot CLI**: `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` (project); `.github/skills`, plus `.claude/skills` and `.agents/skills`, which Copilot CLI is documented to read directly (project), `~/.copilot/skills` and `~/.agents/skills` (personal); `.vscode/mcp.json` (`servers` key), the portable `.mcp.json` (`mcpServers` key, same file Claude Code reads), and `~/.copilot/mcp-config.json`; hooks from **two separate sources**, combined: the shared `.claude/settings.json`/`settings.local.json`, and Copilot's own native `.github/hooks/*.json` (project) / `~/.copilot/hooks/*.json` (personal).

**Codex**: `AGENTS.md` (project); `~/.codex/config.toml`'s `[mcp_servers.*]` tables (global); for Wrapped, `~/.codex/sessions/<year>/<month>/<day>/rollout-*.jsonl`, created lazily the first time a real session runs (a fresh install, or one that has only used the separate SQLite thread-history index, has no `sessions/` directory at all yet).

**Cursor**: `.cursorrules` and `.cursor/rules/*.mdc` / `*.md` (project); `.cursor/mcp.json` (project) and `~/.cursor/mcp.json` (global).

Cursor's Doctor sources were not verified against a real local install when its adapter was built (no real config existed on the build machine); they follow the documented shape directly. Claude Code's, Codex's and Copilot's were all verified against real installs -- Codex's Wrapped support in particular required installing Codex CLI and running real sessions specifically to check, after an earlier check on a different machine had found no `sessions/` directory and concluded (wrongly, as it turned out) that Wrapped support wasn't schedulable. See [`docs/notes.md`](../notes.md) for the full history of what was and was not verified.

## When two agents share a file

Copilot CLI is documented to read several of Claude Code's own files directly, not a separate format of its own: `.claude/skills`, `.claude/settings.json`/`settings.local.json`, and the portable-format `.mcp.json`. If a project is detected as both agents (the default `--agent all` checks every agent), a real problem in one of those shared files is found and scored **once**, not once per agent, and the report tells you which other agent it also affects:

```
HIGH  MCP-01  MCP server notion uses command notion-mcp-server which was not found on PATH
      Fix: Fix the config syntax, install the command, or remove the server entry.
      Also affects: Copilot (same file)
```

This only appears for findings that are genuinely about the file's content, not for anything session-dependent. For example, "this skill was not used in the last 30 days" is a claim about Claude Code's own session log specifically; even if the skill file is shared with Copilot, that claim is never labeled as also applying to Copilot, since there is no Copilot usage data to check it against.

If you run `--agent copilot` alone (not the default `--agent all`) on a project that only uses these shared, portable file locations, Copilot's adapter still reads them directly: it does not depend on Claude Code also being detected.

## `(possible)` findings

A few rules (currently `SKL-06` and `MCP-05`, both Claude Code-only) check whether a skill or MCP server was actually used in your last 30 days of session logs. These are marked `possible` because the underlying signal is a heuristic, not a certainty:

```
LOW   MCP-05  MCP server linear was not used in the last 30 days (possible)
      Fix: Remove or disable the server if you no longer need it.
```

Two things are true about `possible` findings that are not true of ordinary ones: they need at least 14 days of session log coverage to fire at all (too little data and the rule stays silent rather than guessing), and their contribution to the score is capped at half of what an equivalent non-`possible` finding would cost, since a heuristic guess should never dominate the score the way a certain fact does.

## Requesting a new agent

The `Adapter` interface (`src/adapters/`) is deliberately generic: adding a new agent is a new file implementing seven methods (`detect`, `readInstructions`, `readSkills`, `readMcp`, `readPlugins`, `readSettings`, `readSessions`), not a change to core scoring or rule logic. Windsurf, Cline and Continue.dev are tracked as backlog candidates in [`docs/notes.md`](../notes.md); each needs the same kind of research Copilot's adapter did (real config-shape verification, and a check for the same kind of file-sharing overlap Copilot turned out to have with Claude Code) before assuming it is a clean, disjoint addition.
