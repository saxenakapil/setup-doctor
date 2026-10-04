# MCP server

`setup-doctor mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio. It exposes two read-only tools, so an MCP client can audit your setup or summarize your usage.

```bash
npx setup-doctor mcp
```

The server is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.saxenakapil/setup-doctor`.

## Tools

### `doctor`

Audits the agent setup. It returns the same JSON as `doctor --format json`.

| Argument | Type | Description |
| --- | --- | --- |
| `path` | string | Project directory to audit. Defaults to the current directory. |
| `agent` | `claude`, `codex`, `cursor`, `copilot`, `all` | Agent to check. Defaults to auto-detection. |
| `scope` | `project`, `global`, `all` | Locations to check. Defaults to `all`. |
| `minSeverity` | `low`, `medium`, `high`, `critical` | Hide findings below this level. The score is not affected. |

### `wrapped`

Summarizes local usage. It returns the same JSON as `wrapped --format json`.

| Argument | Type | Description |
| --- | --- | --- |
| `agent` | `claude`, `codex`, `copilot`, `cursor` | Agent to summarize. Defaults to `claude`. |
| `period` | string | `7d`, `30d`, `ytd`, `all` or `YYYY-MM-DD:YYYY-MM-DD`. Defaults to `30d`. |
| `tz` | string | IANA time zone for day boundaries. Defaults to the local time zone. |
| `anonymize` | boolean | Hide project names. Defaults to `false`. |

Both tools are annotated `readOnlyHint: true`.

## Guarantees

- The server never writes files, makes network requests, or runs any command found in your configuration.
- There is no equivalent of `--fix`. Fix mode needs a diff preview and an explicit confirmation, and an MCP tool call has no safe way to ask for one.
- Output is the same as the CLI's JSON, including redaction. Secret values appear as `[REDACTED]`.

## Adding the server to Claude Desktop

Open the Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

You can also open it from Claude Desktop under Settings, then Developer, then Edit Config.

Add the server:

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

Restart Claude Desktop. Any MCP client that can start a local stdio server works with the same `command` and `args`.

To pin a version, replace `setup-doctor@latest` with an exact version, such as `setup-doctor@0.3.2`. A pinned version will not change without your action.

## Example response

Calling `doctor` with `{ "agent": "claude", "scope": "project" }` against a project with a broken hook returns:

```json
{
  "schemaVersion": 1,
  "toolVersion": "0.3.2",
  "rulesVersion": "1.2.0",
  "agentsDetected": ["claude"],
  "score": 85,
  "band": "Good",
  "findings": [
    {
      "ruleId": "SET-02",
      "severity": "high",
      "message": "Hook PreToolUse in .claude/settings.json points to scripts/missing.sh which is missing or not executable",
      "fix": "Correct the path, make the script executable, or remove the hook."
    }
  ]
}
```

Paths are shortened in this example. The response also includes `categories`, `suppressed`, `skipped` and `warnings`. See [doctor](doctor.md#json) for the full field list.

## Cursor requires Node 22.5 or later

`wrapped` with `"agent": "cursor"` reads Cursor's database through Node's built-in `node:sqlite` module, which needs Node 22.5 or later on the machine running the server. On an older version, the tool returns a message that names your Node version.
