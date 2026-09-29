// Two diff renderers. `renderDeletionDiff`/`applyLineRemoval` are
// specialized for deletion-only changes: every v1 safe fix (docs/scope.md
// section 14) only removed lines, never added or reordered them, so
// `newLines` was always a subsequence of `oldLines` in the same order,
// letting a single two-pointer pass find exactly which old lines were
// dropped, no general diff algorithm needed. `renderGeneralDiff` (added for
// SET-02's fix, see below) is the real LCS diff this file's own comment
// once said would be needed "before use on any fix that adds or reorders
// content" -- that day came once a fix needed to re-serialize JSON rather
// than delete whole lines.

const CONTEXT_LINES = 3;

interface Hunk {
  oldStart: number; // 1-indexed
  oldLines: string[];
  removedAt: Set<number>; // indexes into oldLines that were removed
}

function buildHunks(oldLines: string[], removedLineNumbers: Set<number>): Hunk[] {
  const removedIndexes = new Set([...removedLineNumbers].map((n) => n - 1));
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < oldLines.length) {
    if (!removedIndexes.has(i)) {
      i++;
      continue;
    }
    // Found a removed line; grow a hunk with CONTEXT_LINES of surrounding context.
    const hunkStart = Math.max(0, i - CONTEXT_LINES);
    let end = i;
    // Extend the hunk while removed lines keep appearing within 2*CONTEXT of each other.
    for (let j = i + 1; j < oldLines.length; j++) {
      if (removedIndexes.has(j) && j - end <= CONTEXT_LINES * 2) {
        end = j;
      } else if (j - end > CONTEXT_LINES * 2) {
        break;
      }
    }
    const hunkEnd = Math.min(oldLines.length - 1, end + CONTEXT_LINES);
    hunks.push({
      oldStart: hunkStart + 1,
      oldLines: oldLines.slice(hunkStart, hunkEnd + 1),
      removedAt: new Set([...removedIndexes].filter((idx) => idx >= hunkStart && idx <= hunkEnd).map((idx) => idx - hunkStart)),
    });
    i = hunkEnd + 1;
  }
  return hunks;
}

export function renderDeletionDiff(displayPath: string, oldText: string, removedLineNumbers: number[]): string {
  const oldLines = oldText.split('\n');
  const removedSet = new Set(removedLineNumbers);
  const hunks = buildHunks(oldLines, removedSet);

  const out: string[] = [`--- a/${displayPath}`, `+++ b/${displayPath}`];
  for (const hunk of hunks) {
    const newLineCount = hunk.oldLines.length - hunk.removedAt.size;
    out.push(`@@ -${hunk.oldStart},${hunk.oldLines.length} +${hunk.oldStart},${newLineCount} @@`);
    hunk.oldLines.forEach((line, idx) => {
      out.push(`${hunk.removedAt.has(idx) ? '-' : ' '}${line}`);
    });
  }
  return out.join('\n');
}

/** Applies a deletion-only fix: returns the new text with the given 1-indexed lines removed. */
export function applyLineRemoval(oldText: string, removedLineNumbers: number[]): string {
  const removedSet = new Set(removedLineNumbers);
  const lines = oldText.split('\n');
  return lines.filter((_, idx) => !removedSet.has(idx + 1)).join('\n');
}

// General-purpose diff, added for SET-02's fix (docs/notes.md): unlike
// every fix above, removing a hook from JSON means re-serializing the
// file, which can also change one line's trailing comma, not just delete
// lines. A plain LCS line diff (small, O(n*m), fine for the small config
// files every fix in this project touches) renders that correctly as an
// add+remove pair instead of forcing it through the deletion-only path.

interface DiffOp {
  type: 'same' | 'add' | 'remove';
  line: string;
}

function computeLcsDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = oldLines[i] === newLines[j] ? (lcs[i + 1]![j + 1] as number) + 1 : Math.max(lcs[i + 1]![j] as number, lcs[i]![j + 1] as number);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'same', line: oldLines[i] as string });
      i++;
      j++;
    } else if ((lcs[i + 1]![j] as number) >= (lcs[i]![j + 1] as number)) {
      ops.push({ type: 'remove', line: oldLines[i] as string });
      i++;
    } else {
      ops.push({ type: 'add', line: newLines[j] as string });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'remove', line: oldLines[i++] as string });
  while (j < m) ops.push({ type: 'add', line: newLines[j++] as string });
  return ops;
}

/** Unified diff between two arbitrary texts (additions and deletions both), for fixes that re-serialize a file rather than only delete lines from it. */
export function renderGeneralDiff(displayPath: string, oldText: string, newText: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const ops = computeLcsDiff(oldLines, newLines);
  const out = [`--- a/${displayPath}`, `+++ b/${displayPath}`, `@@ -1,${oldLines.length} +1,${newLines.length} @@`];
  for (const op of ops) {
    const prefix = op.type === 'same' ? ' ' : op.type === 'remove' ? '-' : '+';
    out.push(`${prefix}${op.line}`);
  }
  return out.join('\n');
}
