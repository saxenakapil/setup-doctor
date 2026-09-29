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
  // Real runtime dependencies (mcp mode only) stay external rather than
  // bundled: @modelcontextprotocol/sdk's own internal imports pull in its
  // full HTTP transport stack (express, hono, and further down, real
  // network modules) that this project never calls (only the stdio server
  // transport is used), and bundling it in bloated dist/bin.js from 208kb
  // to 1.6mb for entirely dead code. Left external, npm/npx installs the
  // real dependency into node_modules as normal and none of that code is
  // physically present in the shipped bundle at all.
  external: ['@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk/*', 'zod'],
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
