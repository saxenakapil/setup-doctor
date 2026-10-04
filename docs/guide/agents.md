# Agents

`setup-doctor` supports four agents and provides partial support for others. This page lists what each agent reads and which checks apply.

## Support matrix

| Agent | Doctor | Wrapped |
| --- | --- | --- |
| Claude Code | Full: all 30 rules | Yes |
| Codex | Instructions and MCP servers | Yes |
| GitHub Copilot CLI | Instructions, skills, MCP servers, settings and hooks | Yes |
| Cursor | Instructions, MCP servers and project skills | Yes, requires Node 22.5 or later |
| Other agents (`.windsurfrules`, `.clinerules`) | Instruction rules only | No |

Categories that do not apply to an agent are excluded from its score. For example, Codex has no plugin concept, so Plugins shows `n/a` and is not counted as a failure. Skills apply to Claude Code, Copilot CLI and Cursor. Codex has no skills concept.

## What each agent reads

### Claude Code

- **Instructions:** `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md` in the project; `~/.claude/CLAUDE.md` globally; nested `CLAUDE.md` files in subdirectories. `@import` references are followed.
- **Skills and subagents:** `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`, in the project and globally.
- **MCP servers:** `.mcp.json` (project) and `~/.claude.json` (global).
- **Settings and hooks:** `.claude/settings.json` and `.claude/settings.local.json`.
- **Wrapped:** `~/.claude/projects/**/*.jsonl`.

### GitHub Copilot CLI

- **Instructions:** `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`.
- **Skills:** `.github/skills`, plus `.claude/skills` and `.agents/skills`, which Copilot CLI reads directly. Personal skills are read from `~/.copilot/skills` and `~/.agents/skills`.
- **MCP servers:** `.vscode/mcp.json` (`servers` key), the portable `.mcp.json` (`mcpServers` key), and `~/.copilot/mcp-config.json`.
- **Settings and hooks:** the shared `.claude/settings.json` and `.claude/settings.local.json`, and Copilot's own `.github/hooks/*.json` (project) or `~/.copilot/hooks/*.json` (personal). Both are combined.
- **Wrapped:** `~/.copilot/session-state/<sessionId>/events.jsonl`. Resuming a session appends to the same file.

### Codex

- **Instructions:** `AGENTS.md` in the project.
- **MCP servers:** `[mcp_servers.*]` tables in `~/.codex/config.toml`.
- **Wrapped:** `~/.codex/sessions/<year>/<month>/<day>/rollout-*.jsonl`. Codex creates this directory the first time a session runs.

### Cursor

- **Instructions:** `.cursorrules` and `.cursor/rules/*.mdc` or `*.md` in the project.
- **MCP servers:** `.cursor/mcp.json` in the project and `~/.cursor/mcp.json` globally.
- **Skills:** `.cursor/skills/*/SKILL.md`, project scope only. Cursor's personal skills are stored in a cloud-synced store with no fixed path on disk, so they are not read. Cursor's built-in skills in `~/.cursor/skills-cursor/` are never scanned.
- **Wrapped:** Cursor's `state.vscdb` SQLite database in its per-OS data directory. Reading it requires Node 22.5 or later.

## Shared files

Copilot CLI reads several of Claude Code's files directly: `.claude/skills`, `.claude/settings.json`, `.claude/settings.local.json` and `.mcp.json`. When a project uses both agents, a problem in one of these files is reported once, not once per agent. The report notes the other agent it also affects:

```
HIGH  MCP-01  MCP server notion uses command notion-mcp-server which was not found on PATH
      Fix: Fix the config syntax, install the command, or remove the server entry.
      Also affects: Copilot (same file)
```

Session-based findings are not shared. A finding such as "this skill was not used in the last 30 days" depends on Claude Code session logs, so it is never attributed to Copilot.

If you run `--agent copilot` alone on a project that uses only these shared locations, Copilot still reads them directly. It does not require Claude Code to be detected as well.

## Possible findings

`SKL-06` and `MCP-05` check whether a skill or MCP server was used in your recent session history. They are Claude Code rules and are marked `(possible)` because usage is inferred from logs:

```
LOW   MCP-05  MCP server linear was not used in the last 30 days (possible)
      Fix: Remove or disable the server if you no longer need it.
```

Two things distinguish possible findings:

- They require at least 14 days of session log coverage. With less history, the rule does not fire.
- Each one costs half as much score as a certain finding of the same severity.

## Other agents

`.windsurfrules` and `.clinerules` in the project root are read as instruction files, and the instruction rules apply to them. The report labels them as "Other agent". Their presence is the only detection signal, and they cannot be selected with `--agent`.

`AGENTS.md` is read as a Codex file and is not reported a second time.

## Requesting an agent

Each agent needs its own reader, which must match the real file layout and any file shared with another agent. Open an issue describing the agent and where its configuration lives.
