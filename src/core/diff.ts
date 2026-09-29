// A unified diff renderer specialized for deletion-only changes: every
// v1 safe fix (docs/scope.md section 14) only removes lines, never adds or
// reorders them, so `newLines` is always a subsequence of `oldLines` in the
// same order. That makes a general diff algorithm (Myers, LCS, ...)
// unnecessary: a single two-pointer pass finds exactly which old lines were
// dropped. Not a general-purpose diff; would need extending before use on
// any fix that adds or reorders content.

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
