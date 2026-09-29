// Static guard for the privacy rules: no network access, no process execution,
// and a tiny dependency list. Runs in CI. See docs/scope.md section 15.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const srcDir = join(root, 'src');

const forbidden = [
  { re: /from\s+['"](?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process)['"]/, why: 'network or process module import' },
  { re: /require\(\s*['"](?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process)['"]\s*\)/, why: 'network or process module require' },
  { re: /import\(\s*['"](?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process)['"]\s*\)/, why: 'network or process dynamic import' },
  { re: /\bfetch\s*\(/, why: 'fetch call' },
  { re: /\bXMLHttpRequest\b/, why: 'XMLHttpRequest' },
  { re: /\bWebSocket\b/, why: 'WebSocket' },
  { re: /\bEventSource\b/, why: 'EventSource' },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(srcDir)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const { re, why } of forbidden) {
      if (re.test(line)) problems.push(`${file}:${i + 1}: ${why}`);
    }
  });
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length > 3) problems.push(`package.json: ${deps.length} runtime dependencies (limit 3)`);
if (pkg.scripts && Object.keys(pkg.scripts).some((k) => ['preinstall', 'install', 'postinstall'].includes(k))) {
  problems.push('package.json: install scripts are not allowed');
}

if (problems.length) {
  console.error('Privacy guard failed:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('Privacy guard OK');
