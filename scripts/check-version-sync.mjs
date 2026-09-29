// Fails when the version differs between package.json, the plugin manifest,
// the marketplace file and src/version.ts.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const market = JSON.parse(read('.claude-plugin/marketplace.json'));
const src = /VERSION\s*=\s*'([^']+)'/.exec(read('src/version.ts'))?.[1];

const found = {
  'package.json': pkg.version,
  '.claude-plugin/plugin.json': plugin.version,
  '.claude-plugin/marketplace.json': market.plugins?.[0]?.version,
  'src/version.ts': src,
};

const versions = new Set(Object.values(found));
if (versions.size !== 1) {
  console.error('Version mismatch:');
  for (const [file, v] of Object.entries(found)) console.error(`  ${file}: ${v}`);
  process.exit(1);
}
console.log(`Version sync OK (${[...versions][0]})`);
