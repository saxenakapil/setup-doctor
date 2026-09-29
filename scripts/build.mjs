import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

await build({
  entryPoints: ['src/bin.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/bin.js',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'info',
});

// Font files are read at runtime (src/render/fonts.ts), not bundled by
// esbuild, so they must be copied alongside the bundle. See docs/themes.md
// section 5 and docs/notes.md for the font-asset status.
const fontsSrc = 'src/data/fonts';
const fontsDest = 'dist/data/fonts';
if (existsSync(fontsSrc)) {
  mkdirSync(fontsDest, { recursive: true });
  for (const entry of readdirSync(fontsSrc)) {
    cpSync(join(fontsSrc, entry), join(fontsDest, entry));
  }
}
