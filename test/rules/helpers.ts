// Loads a real fixture directory through the Claude Code adapter and builds a
// NormalizedModel, so rule tests exercise the same adapter -> rule path the
// CLI uses (see docs/rules.md "Every rule needs one test that triggers it
// and one that does not").

import { join } from 'node:path';
import { claudeCodeAdapter } from '../../src/adapters/claude-code.js';
import { emptyModel } from '../../src/core/runner.js';
import { DEFAULT_CONFIG } from '../../src/core/defaults.js';
import type { DiscoveryContext, NormalizedModel, SetupDoctorConfig } from '../../src/core/types.js';

const FIXTURES_ROOT = join(__dirname, '..', 'fixtures');
// Never read: adapters tolerate a missing home dir, and rule fixtures are
// project-scope only.
const NO_HOME = join(FIXTURES_ROOT, '__no_home__');

export async function loadFixtureModel(fixtureName: string): Promise<NormalizedModel> {
  const root = join(FIXTURES_ROOT, fixtureName);
  const hasProjectSubfolder = await pathExists(join(root, 'project'));
  const homeCandidate = join(root, 'home');

  const ctx: DiscoveryContext = {
    projectRoot: hasProjectSubfolder ? join(root, 'project') : root,
    homeDir: (await pathExists(homeCandidate)) ? homeCandidate : NO_HOME,
    scope: 'all',
    ignore: [],
  };
  const model = emptyModel();
  model.agents = ['claude'];

  const [instructions, skills, mcp, plugins, settings] = await Promise.all([
    claudeCodeAdapter.readInstructions(ctx),
    claudeCodeAdapter.readSkills(ctx),
    claudeCodeAdapter.readMcp(ctx),
    claudeCodeAdapter.readPlugins(ctx),
    claudeCodeAdapter.readSettings(ctx),
  ]);

  model.instructions = instructions.items;
  model.skills = skills.items;
  model.mcpServers = mcp.items;
  model.plugins = plugins.items;
  model.mcpConfigErrors = mcp.configErrors ?? [];
  for (const item of settings.items) {
    if ('event' in item) model.hooks.push(item);
    else model.permissions.push(item);
  }

  if (await pathExists(join(ctx.projectRoot, 'package.json'))) model.buildManifests.push('package.json');

  return model;
}

async function pathExists(path: string): Promise<boolean> {
  const { stat } = await import('node:fs/promises');
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export const config: SetupDoctorConfig = DEFAULT_CONFIG;
