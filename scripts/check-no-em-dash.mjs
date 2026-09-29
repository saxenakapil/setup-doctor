// Static guard for hard rule 9: no em dashes in code, comments, docs or
// output text. See CLAUDE.md. Scans everything this project authors
// (source, scripts, docs, README, CHANGELOG) but not test/ (fixtures
// deliberately contain adversarial or arbitrary content for other rules
// to detect) or generated output (dist, node_modules, coverage).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EM_DASH = String.fromCharCode(0x2014);

const SCAN_ROOTS = ['src', 'scripts', 'docs', 'skills', 'skills-cursor', '.claude-plugin'];
const SCAN_FILES = ['README.md', 'CHANGELOG.md'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|mts|js|mjs|md|json)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [
  ...SCAN_ROOTS.flatMap((d) => {
    const p = join(root, d);
    try {
      return statSync(p).isDirectory() ? walk(p) : [];
    } catch {
      return [];
    }
  }),
  ...SCAN_FILES.map((f) => join(root, f)).filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  }),
];

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) problems.push(`${relative(root, file)}:${i + 1}`);
  });
}

if (problems.length) {
  console.error('Em dash guard failed (hard rule 9: no em dashes in code, comments, docs or output text):');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('Em dash guard OK');
