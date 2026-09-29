// MCP helpers shared by every agent adapter (claude-code, codex, cursor).
// Not itself an adapter, so importing it from multiple adapters does not
// violate "adapters never import each other". See docs/rules.md MCP-01/MCP-03.

import { delimiter, isAbsolute } from 'node:path';
import { pathExists } from './fs-utils.js';
import { isCommandOnPath } from './path-check.js';

/** Env/header key names that look like secrets, computed here so adapters never keep the value. */
export function computeSecretLikeEnvKeys(...sources: unknown[]): string[] {
  const keys: string[] = [];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, rawValue] of Object.entries(source as Record<string, unknown>)) {
      if (typeof rawValue !== 'string') continue;
      const keyLooksSecret = /(key|token|secret|password|passwd|auth)/i.test(key);
      const isLiteral = !rawValue.startsWith('$');
      if (keyLooksSecret && isLiteral && rawValue.length >= 8) keys.push(key);
    }
  }
  return keys;
}

/** MCP-01b: whether a stdio server's command resolves. undefined when not applicable (url server, no command). */
export async function computeCommandFound(command: string | undefined, url: string | undefined): Promise<boolean | undefined> {
  if (!command || url) return undefined;
  if (isAbsolute(command)) return pathExists(command);
  return isCommandOnPath(command, {
    pathEnv: process.env.PATH ?? '',
    delimiter,
    pathExt: process.platform === 'win32' ? process.env.PATHEXT : undefined,
    fileExists: pathExists,
  });
}
