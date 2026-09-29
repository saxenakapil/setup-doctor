# `mcp`: use Doctor and Wrapped from an MCP client

```bash
npx setup-doctor mcp
```

Starts an [MCP](https://modelcontextprotocol.io) server over stdio, exposing two read-only tools:

- **`doctor`**: same as `doctor --format json`, arguments `path`, `agent`, `scope`, `minSeverity` (all optional, same meaning as the equivalent CLI flags).
- **`wrapped`**: same as `wrapped --format json`, arguments `agent`, `period`, `tz`, `anonymize` (all optional, same meaning as the equivalent CLI flags).

Both tools are marked `readOnlyHint: true` and return the exact same JSON shape the CLI's `--format json` already produces (see [`doctor.md`](doctor.md) and [`wrapped.md`](wrapped.md) for the full field reference), as text content. Nothing about this mode writes to disk, calls the network, or executes anything: it is the same read-only engine the CLI already uses, wrapped in an MCP tool interface instead of argument parsing and terminal output.

**There is no `--fix` equivalent.** Fix mode's CLI safety model (a diff preview, a backup, and an explicit `--yes` confirmation with no TTY prompt available) has no equivalent safe "ask before writing" channel over MCP, so this mode stays strictly read-only by design, the same way every other command already is without `--fix`.

## Adding it to Claude Desktop

Edit Claude Desktop's own MCP config file (Settings -> Developer -> Edit Config):

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "setup-doctor": {
      "command": "npx",
      "args": ["-y", "setup-doctor@latest", "mcp"]
    }
  }
}
```

Restart Claude Desktop. Any other MCP client that can spawn a local stdio server works the same way; the `command`/`args` shape above is not Claude-Desktop-specific.

## A real example

Calling `doctor` with `{ "agent": "claude", "scope": "project" }` against a project with one broken hook returns exactly what `doctor --format json` would print locally:

```json
{
  "schemaVersion": 1,
  "toolVersion": "0.1.0",
  "rulesVersion": "1.1.0",
  "agentsDetected": ["claude"],
  "score": 85,
  "band": "Good",
  "categories": [ /* ... */ ],
  "findings": [
    {
      "ruleId": "SET-02",
      "severity": "high",
      "message": "Hook ... points to a script that does not exist",
      "fix": "..."
    }
  ]
}
```

Verified end to end with a real MCP client (the SDK's own `Client` + `StdioClientTransport`, not a mock): connected, listed both tools, called `doctor` against a real broken-hook fixture and got real findings back, and called `wrapped` against this machine's own real Claude Code session history and got real metrics back. Also verified against a genuinely `npm install`-ed tarball (not just this repo's own `node_modules`), since `@modelcontextprotocol/sdk` and `zod` are real runtime dependencies that need to actually resolve for a real user, not just during development.

## Cursor's Node version requirement still applies

`wrapped` with `agent: "cursor"` needs Node 22.5 or later on the machine running the MCP server (it reads Cursor's local database via the built-in `node:sqlite` module); on an older Node, the tool returns the same explanatory text the CLI prints instead of a raw error.
