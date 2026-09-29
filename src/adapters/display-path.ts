// Converts an absolute path to a display path: relative to the project root
// when inside it, "~/"-prefixed when inside the home dir, else absolute.
// Shared by every adapter. See docs/scope.md section 8.1 ("paths reported
// to the user are relative to the project root where possible").

import { relative, sep } from 'node:path';
import type { DiscoveryContext } from '../core/types.js';

export function toDisplayPath(absPath: string, ctx: DiscoveryContext): string {
  const rel = relative(ctx.projectRoot, absPath);
  if (!rel.startsWith('..') && !rel.startsWith(sep)) {
    return rel.split(sep).join('/') || '.';
  }
  const homeRel = relative(ctx.homeDir, absPath);
  if (!homeRel.startsWith('..') && !homeRel.startsWith(sep)) {
    return `~/${homeRel.split(sep).join('/')}`;
  }
  return absPath;
}
