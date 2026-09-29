// docs/scope.md section 16: "Wrapped over 1 GB of logs (streamed): under 60
// seconds and under 200 MB memory." This generates a large synthetic JSONL
// file on the fly (never committed) and streams it through the real parser,
// counting records without retaining them, then checks the RSS delta.
//
// Memory measurements are inherently a little noisy (GC timing, Node
// version), so this asserts a generous-but-meaningful bound rather than
// chasing the exact 200 MB figure to the byte, and forces a GC when the
// test runner exposes one (`node --expose-gc`) for a cleaner signal.

import { createWriteStream, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSessionFile } from '../../src/wrapped/parse-claude.js';

const TARGET_BYTES = 1024 * 1024 * 1024; // 1 GB
const MEMORY_BUDGET_MB = 200;

let dir: string;
let filePath: string;

function assistantLine(i: number): string {
  // Two content-block lines share (id, requestId) for every other turn, to
  // also exercise the dedup path at scale, not just raw line volume.
  const shareKey = Math.floor(i / 2);
  return JSON.stringify({
    type: 'assistant',
    sessionId: `sess-${shareKey % 500}`,
    timestamp: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    requestId: `req_${shareKey}`,
    message: {
      id: `msg_${shareKey}`,
      model: 'claude-sonnet-5',
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 20 },
      content: [{ type: 'tool_use', name: i % 2 === 0 ? 'Read' : 'Edit' }],
    },
  });
}

function userLine(i: number, padding: string): string {
  return JSON.stringify({
    type: 'user',
    sessionId: `sess-${i % 500}`,
    timestamp: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    message: { content: [{ type: 'text', text: `A realistic-sized prompt. ${padding}` }] },
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'setup-doctor-1gb-'));
  filePath = join(dir, 'huge-session.jsonl');
  const padding = 'x'.repeat(50_000); // most of the bulk, mimicking a large pasted prompt

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createWriteStream(filePath);
    stream.on('error', reject);
    let written = 0;
    let i = 0;

    function writeMore() {
      let ok = true;
      while (ok && written < TARGET_BYTES) {
        const line = i % 3 === 0 ? userLine(i, padding) : assistantLine(i);
        const chunk = line + '\n';
        written += Buffer.byteLength(chunk);
        ok = stream.write(chunk);
        i++;
      }
      if (written >= TARGET_BYTES) {
        stream.end();
      } else {
        stream.once('drain', writeMore);
      }
    }

    stream.on('finish', () => resolvePromise());
    writeMore();
  });
}, 120_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseSessionFile: 1 GB synthetic log', () => {
  it('streams within a bounded memory footprint without retaining message text', async () => {
    const sizeBytes = statSync(filePath).size;
    expect(sizeBytes).toBeGreaterThanOrEqual(TARGET_BYTES);

    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    const before = process.memoryUsage().rss;

    let count = 0;
    const start = Date.now();
    for await (const record of parseSessionFile(filePath, 'huge-project', null)) {
      count++;
      // Deliberately not retained: pushing every record into an array here
      // would test this test's own memory use, not the parser's.
      void record;
    }
    const elapsedMs = Date.now() - start;

    gc?.();
    const after = process.memoryUsage().rss;
    const deltaMB = (after - before) / (1024 * 1024);

    expect(count).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(60_000);
    expect(deltaMB).toBeLessThan(MEMORY_BUDGET_MB);
  }, 120_000);
});
