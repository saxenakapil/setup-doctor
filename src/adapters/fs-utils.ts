// Shared, safe filesystem helpers used by adapters. No adapter imports
// another adapter; this module holds the common read-only primitives.
// See docs/scope.md sections 8.4 and 15 (path safety, symlink loops, size limit).

import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_FILE_SIZE_BYTES, SKIP_DIRS } from '../core/defaults.js';

export interface ReadOk {
  ok: true;
  text: string;
  sizeBytes: number;
}

export interface ReadFail {
  ok: false;
  reason: string;
}

export type ReadResult = ReadOk | ReadFail;

export async function readTextFileSafe(path: string): Promise<ReadResult> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { ok: false, reason: 'not found' };
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: 'file exceeds 10 MB' };
  }
  try {
    const text = await readFile(path, 'utf8');
    return { ok: true, text, sizeBytes: size };
  } catch (err) {
    return { ok: false, reason: `unreadable: ${(err as Error).message}` };
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function listDirSafe(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

/**
 * Finds files named `fileName` nested under `root`, up to `maxDepth` levels
 * deep (root itself is depth 0), skipping SKIP_DIRS and symlink loops.
 */
export async function findNestedFiles(root: string, fileName: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];
  const visitedRealDirs = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let realDir: string;
    try {
      realDir = await realpath(dir);
    } catch {
      return;
    }
    if (visitedRealDirs.has(realDir)) return;
    visitedRealDirs.add(realDir);

    for (const entry of await listDirSafe(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = await lstat(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        let target;
        try {
          target = await stat(full);
        } catch {
          continue;
        }
        if (target.isDirectory()) {
          await walk(full, depth + 1);
        } else if (entry === fileName) {
          found.push(full);
        }
        continue;
      }
      if (st.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry === fileName) {
        found.push(full);
      }
    }
  }

  await walk(root, 0);
  return found.sort();
}
