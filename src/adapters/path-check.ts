// Whether a command name resolves to a file on PATH. Injectable (PATH
// string, delimiter, PATHEXT and a fileExists function) so tests never
// depend on the real machine's PATH. Never executes anything (docs/rules.md
// MCP-01 notes).

import { join } from 'node:path';

export interface PathCheckOptions {
  pathEnv: string;
  delimiter: string;
  pathExt?: string;
  fileExists: (path: string) => Promise<boolean>;
}

export async function isCommandOnPath(command: string, opts: PathCheckOptions): Promise<boolean> {
  const dirs = opts.pathEnv.split(opts.delimiter).filter(Boolean);
  const exts = opts.pathExt
    ? opts.pathExt.split(opts.delimiter).filter(Boolean)
    : [];

  for (const dir of dirs) {
    if (await opts.fileExists(join(dir, command))) return true;
    for (const ext of exts) {
      if (command.toLowerCase().endsWith(ext.toLowerCase())) continue;
      if (await opts.fileExists(join(dir, command + ext))) return true;
    }
  }
  return false;
}
