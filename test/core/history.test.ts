import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendHistoryEntry, compareToLast, formatComparisonLine, HISTORY_FILE_NAME, readHistory, type HistoryEntry } from '../../src/core/history.js';

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return { ts: '2026-01-01T00:00:00.000Z', score: 80, band: 'Good', agentsDetected: ['claude'], rulesVersion: '1.0.0', ...overrides };
}

describe('history', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-doctor-history-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('readHistory returns [] when no file exists', async () => {
    expect(await readHistory(dir)).toEqual([]);
  });

  it('appendHistoryEntry writes one JSON line, readHistory reads it back', async () => {
    const ok = await appendHistoryEntry(dir, entry());
    expect(ok).toBe(true);
    const entries = await readHistory(dir);
    expect(entries).toEqual([entry()]);
  });

  it('appends multiple entries as separate lines, in order', async () => {
    await appendHistoryEntry(dir, entry({ ts: '2026-01-01T00:00:00.000Z', score: 70 }));
    await appendHistoryEntry(dir, entry({ ts: '2026-01-02T00:00:00.000Z', score: 80 }));
    const entries = await readHistory(dir);
    expect(entries.map((e) => e.score)).toEqual([70, 80]);
  });

  it('skips a malformed line without losing the rest of the file', async () => {
    writeFileSync(join(dir, HISTORY_FILE_NAME), `${JSON.stringify(entry({ score: 70 }))}\nnot json\n${JSON.stringify(entry({ score: 90 }))}\n`);
    const entries = await readHistory(dir);
    expect(entries.map((e) => e.score)).toEqual([70, 90]);
  });

  it('skips a line missing required fields', async () => {
    writeFileSync(join(dir, HISTORY_FILE_NAME), `${JSON.stringify({ ts: '2026-01-01T00:00:00.000Z' })}\n${JSON.stringify(entry())}\n`);
    const entries = await readHistory(dir);
    expect(entries).toEqual([entry()]);
  });

  it('appendHistoryEntry returns false rather than throwing when the path is not writable', async () => {
    const ok = await appendHistoryEntry(join(dir, 'nonexistent', 'nested'), entry());
    expect(ok).toBe(false);
  });

  it('compareToLast returns null with no prior history', () => {
    expect(compareToLast([], 80, '1.0.0')).toBeNull();
  });

  it('compareToLast computes delta against the most recent (last) entry, not an earlier one', () => {
    const history = [entry({ ts: '2026-01-01T00:00:00.000Z', score: 60 }), entry({ ts: '2026-01-02T00:00:00.000Z', score: 70 })];
    const comparison = compareToLast(history, 76, '1.0.0');
    expect(comparison).toMatchObject({ delta: 6, regressed: false, rulesVersionChanged: false });
    expect(comparison?.previous.score).toBe(70);
  });

  it('flags a regression when the score dropped', () => {
    const comparison = compareToLast([entry({ score: 90 })], 82, '1.0.0');
    expect(comparison).toMatchObject({ delta: -8, regressed: true });
  });

  it('flags a rules version change', () => {
    const comparison = compareToLast([entry({ rulesVersion: '1.0.0' })], 80, '1.1.0');
    expect(comparison?.rulesVersionChanged).toBe(true);
  });

  it('formatComparisonLine includes a rules-version caveat only when the version actually changed', () => {
    const same = compareToLast([entry({ score: 70, rulesVersion: '1.0.0' })], 80, '1.0.0')!;
    expect(formatComparisonLine(same)).not.toContain('rules changed');

    const changed = compareToLast([entry({ score: 70, rulesVersion: '1.0.0' })], 80, '1.1.0')!;
    expect(formatComparisonLine(changed)).toContain('rules changed 1.0.0 -> 1.1.0');
  });

  it('formatComparisonLine shows a real delta with sign and the previous run\'s timestamp', () => {
    const comparison = compareToLast([entry({ score: 70, ts: '2026-01-01T00:00:00.000Z' })], 82, '1.0.0')!;
    expect(formatComparisonLine(comparison)).toBe('Score history: 70 -> 82 (+12) since 2026-01-01T00:00:00.000Z');
  });
});
