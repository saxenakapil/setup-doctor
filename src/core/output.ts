// Safe output-file writing shared by `doctor --format html/json` and
// `badge`. See docs/scope.md PR-3 (never overwrite without confirmation)
// and section 14 (writes go only to the chosen output path).

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface WriteOutputResult {
  ok: boolean;
  path: string;
  reason?: string;
}

export async function writeOutputFile(
  outDir: string,
  fileName: string,
  content: string,
  yes: boolean,
): Promise<WriteOutputResult> {
  const path = join(outDir, fileName);
  let exists = false;
  try {
    await stat(path);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists && !yes) {
    return { ok: false, path, reason: 'already exists; pass --yes to overwrite' };
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(path, content, 'utf8');
  return { ok: true, path };
}
