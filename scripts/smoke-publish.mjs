// Real publish smoke test: pack the package the way `npm publish` would,
// install the tarball into a scratch project with a plain `npm install`
// (not `npm link`, which skips the packing step entirely), and run the
// installed binary. This is a dev-only script (not shipped in the
// package), so it may use child_process and the network the way the
// runtime tool itself never may.
//
// Run with: npm run smoke:publish (after `npm run build`)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isWindows = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  // Windows needs shell: true to execute .cmd shims (npm itself, and the
  // installed setup-doctor.cmd) via CreateProcess.
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: isWindows, ...opts });
  if (result.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    console.error(`Smoke test failed: ${label}\nExpected to find: ${needle}\nGot:\n${haystack}`);
    process.exit(1);
  }
}

const repoRoot = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), 'setup-doctor-smoke-'));
const packDir = join(scratch, 'pack');
const installRoot = join(scratch, 'install-root');
const fixtureProject = join(scratch, 'fixture-project');
mkdirSync(packDir, { recursive: true });
mkdirSync(installRoot, { recursive: true });
mkdirSync(fixtureProject, { recursive: true });

try {
  console.log('Packing...');
  const packOut = run('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot });
  const tarballName = packOut.trim().split('\n').pop();
  const tarballPath = join(packDir, tarballName);
  if (!existsSync(tarballPath)) {
    console.error(`Expected tarball at ${tarballPath}, got npm pack output:\n${packOut}`);
    process.exit(1);
  }

  console.log('Installing tarball into a clean project (npm install, not npm link)...');
  writeFileSync(join(installRoot, 'package.json'), JSON.stringify({ name: 'smoke-test', version: '0.0.0', private: true }));
  run('npm', ['install', tarballPath], { cwd: installRoot });

  const bin = join(installRoot, 'node_modules', '.bin', isWindows ? 'setup-doctor.cmd' : 'setup-doctor');
  if (!existsSync(bin)) {
    console.error(`Expected installed bin at ${bin}`);
    process.exit(1);
  }

  writeFileSync(join(fixtureProject, 'CLAUDE.md'), 'Run npm test before committing.\n');

  console.log('Running --version...');
  assertContains(run(bin, ['--version']), '.', '--version prints something version-shaped');

  console.log('Running --help...');
  assertContains(run(bin, ['--help']), 'Usage:', '--help prints usage');

  console.log('Running doctor against a clean fixture project...');
  const doctorOut = run(bin, ['doctor', fixtureProject, '--agent', 'claude', '--scope', 'project']);
  assertContains(doctorOut, 'Setup Doctor', 'doctor prints a report');
  assertContains(doctorOut, 'score 100/100', 'clean fixture scores 100');

  console.log('Running rules...');
  assertContains(run(bin, ['rules']), 'INS-01', 'rules lists at least one known rule');

  console.log('Smoke test passed: the packed tarball installs and runs correctly.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
