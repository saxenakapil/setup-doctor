// Embedded font loading. See docs/themes.md section 5.
//
// Font files are read from disk at runtime (never over the network) and
// embedded as base64 @font-face rules. They live in src/data/fonts/ during
// development and dist/data/fonts/ once built (scripts/build.mjs copies
// them next to dist/bin.js). Both locations are tried so this works
// identically whether the code is running from source (tests) or bundled.
//
// Status (see docs/notes.md): only Bricolage Grotesque 600/800 are bundled
// so far. Figtree and JetBrains Mono are still missing; until they are
// added, their families simply have no @font-face rule here, so the CSS
// falls straight through to the documented fallback stack (never a network
// font either way).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const CANDIDATE_FONT_DIRS = [
  join(HERE, '..', 'data', 'fonts'), // dev/test: src/render -> src/data/fonts
  join(HERE, 'data', 'fonts'), // built: dist/bin.js -> dist/data/fonts
];

interface FontFaceSpec {
  family: string;
  weight: number;
  fileName: string;
}

const FONT_FACES: FontFaceSpec[] = [
  { family: 'Bricolage Grotesque', weight: 600, fileName: 'bricolage-grotesque-600.woff2' },
  { family: 'Bricolage Grotesque', weight: 800, fileName: 'bricolage-grotesque-800.woff2' },
  { family: 'Figtree', weight: 400, fileName: 'figtree-400.woff2' },
  { family: 'Figtree', weight: 600, fileName: 'figtree-600.woff2' },
  { family: 'Figtree', weight: 700, fileName: 'figtree-700.woff2' },
  { family: 'JetBrains Mono', weight: 400, fileName: 'jetbrains-mono-400.woff2' },
  { family: 'JetBrains Mono', weight: 700, fileName: 'jetbrains-mono-700.woff2' },
];

function readFontBase64(fileName: string): string | null {
  for (const dir of CANDIDATE_FONT_DIRS) {
    try {
      return readFileSync(join(dir, fileName)).toString('base64');
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Builds @font-face CSS for every font file that is actually present.
 * Missing files are skipped silently (scope.md section 17: "Font file
 * missing or corrupt: fall back to the system font stack; do not fail").
 */
export function embeddedFontFaceCss(): string {
  const rules: string[] = [];
  for (const spec of FONT_FACES) {
    const base64 = readFontBase64(spec.fileName);
    if (!base64) continue;
    rules.push(
      `@font-face { font-family: '${spec.family}'; font-style: normal; font-weight: ${spec.weight}; font-display: swap; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`,
    );
  }
  return rules.join('\n');
}
