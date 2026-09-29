// Parses the two JSON shapes multiple agents use for MCP server config:
// {"mcpServers": {...}} (Claude Code, Cursor, and the "portable format" the
// VS Code MCP docs describe, which Copilot CLI also reads from a project's
// .mcp.json) and {"servers": {...}} (VS Code's own .vscode/mcp.json).
// Shared so a third and fourth adapter parsing the same shape do not each
// carry their own near-identical copy. See docs/notes.md's Phase 3 entry.

import type { Agent, ConfigError, DiscoveryContext, McpServer, Scope, Skipped } from '../core/types.js';
import { toDisplayPath } from './display-path.js';
import { readTextFileSafe } from './fs-utils.js';
import { computeCommandFound, computeSecretLikeEnvKeys } from './mcp-common.js';

interface RawMcpServerDef {
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  disabled?: boolean;
}

export type McpTopLevelKey = 'mcpServers' | 'servers';

export async function parseMcpJsonFile(
  filePath: string,
  topLevelKey: McpTopLevelKey,
  agent: Agent,
  scopeVal: Scope,
  ctx: DiscoveryContext,
  items: McpServer[],
  skipped: Skipped[],
  warnings: string[],
  configErrors: ConfigError[],
): Promise<void> {
  const read = await readTextFileSafe(filePath);
  if (!read.ok) {
    if (read.reason !== 'not found') skipped.push({ path: toDisplayPath(filePath, ctx), reason: read.reason });
    return;
  }
  const displayPath = toDisplayPath(filePath, ctx);
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch (err) {
    const message = `invalid JSON (${(err as Error).message})`;
    warnings.push(`${displayPath}: ${message}`);
    configErrors.push({ agent, scope: scopeVal, sourcePath: displayPath, message });
    return;
  }
  const servers = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[topLevelKey] : undefined;
  if (!servers || typeof servers !== 'object') return;

  for (const [name, defRaw] of Object.entries(servers as Record<string, unknown>)) {
    const def = (defRaw ?? {}) as RawMcpServerDef;
    const command = typeof def.command === 'string' ? def.command : undefined;
    const url = typeof def.url === 'string' ? def.url : undefined;
    const disabled = def.disabled === true;
    items.push({
      agent,
      scope: scopeVal,
      sourcePath: displayPath,
      name,
      command,
      url,
      args: Array.isArray(def.args) ? def.args.filter((a): a is string => typeof a === 'string') : [],
      secretLikeEnvKeys: computeSecretLikeEnvKeys(def.env, def.headers),
      disabled,
      commandFound: disabled ? undefined : await computeCommandFound(command, url),
    });
  }
}
