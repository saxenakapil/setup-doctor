// MCP server mode (docs/notes.md backlog: "MCP server mode"). Exposes
// Doctor and Wrapped as read-only MCP tools over stdio, for Claude Desktop
// and any other MCP client. No --fix equivalent: fix mode's CLI
// confirmation model (--yes, no TTY prompt) has no safe "ask before
// writing" channel over MCP, so this stays read-only by design, same as
// every other command already is without --fix.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VERSION } from '../version.js';
import { handleDoctorTool, handleWrappedTool } from './tools.js';

export function createMcpServer(homeDirOverride?: string): McpServer {
  const server = new McpServer({ name: 'setup-doctor', version: VERSION });

  server.registerTool(
    'doctor',
    {
      title: 'Setup Doctor',
      description:
        'Audit an AI coding agent setup (Claude Code, Codex, GitHub Copilot CLI or Cursor) and return a 0-100 score with concrete findings. Read-only: never modifies files.',
      inputSchema: {
        path: z.string().optional().describe('Project directory to audit. Defaults to the current directory.'),
        agent: z
          .enum(['claude', 'codex', 'cursor', 'copilot', 'all'])
          .optional()
          .describe('Which agent setup to check. Defaults to auto-detect.'),
        scope: z.enum(['project', 'global', 'all']).optional().describe('Which locations to check. Defaults to all.'),
        minSeverity: z
          .enum(['low', 'medium', 'high', 'critical'])
          .optional()
          .describe('Hide findings below this severity. The score itself is unaffected.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => handleDoctorTool(args, homeDirOverride),
  );

  server.registerTool(
    'wrapped',
    {
      title: 'Setup Doctor Wrapped',
      description:
        'Summarize local AI coding agent usage (sessions, active days, tokens, an API-equivalent cost estimate, a persona label) from session logs already on disk. Read-only, local-only: never sends anything over the network.',
      inputSchema: {
        agent: z.enum(['claude', 'codex', 'cursor', 'copilot']).optional().describe('Which agent. Defaults to claude.'),
        period: z
          .string()
          .optional()
          .describe('7d | 30d | ytd | all | YYYY-MM-DD:YYYY-MM-DD. Defaults to 30d.'),
        tz: z.string().optional().describe('IANA timezone for day boundaries. Defaults to the local timezone.'),
        anonymize: z.boolean().optional().describe('Hide project names. Defaults to false.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => handleWrappedTool(args, homeDirOverride),
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
