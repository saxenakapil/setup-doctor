// Orchestrates adapters into the normalized model. Rules, suppression and
// scoring plug in from Phase 2 onward. See docs/scope.md section 10.1.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { getAdapter, knownAgents } from '../adapters/index.js';
import { RULES_VERSION, VERSION } from '../version.js';
import type { Agent, DiscoveryContext, NormalizedModel, Scope } from './types.js';

export interface RunOptions {
  path?: string;
  agent?: Agent | 'auto' | 'all';
  scope?: Scope | 'all';
  homeDir?: string;
}

export function makeDiscoveryContext(options: RunOptions): DiscoveryContext {
  return {
    projectRoot: resolve(options.path ?? '.'),
    homeDir: options.homeDir ?? homedir(),
    scope: options.scope ?? 'all',
  };
}

export async function detectAgents(ctx: DiscoveryContext, requested: Agent | 'auto' | 'all'): Promise<Agent[]> {
  if (requested === 'auto' || requested === 'all') {
    const detected: Agent[] = [];
    for (const agent of knownAgents()) {
      const adapter = getAdapter(agent);
      if (adapter && (await adapter.detect(ctx))) detected.push(agent);
    }
    return detected;
  }
  const adapter = getAdapter(requested);
  if (!adapter) return [];
  return (await adapter.detect(ctx)) ? [requested] : [];
}

export function emptyModel(): NormalizedModel {
  return {
    agents: [],
    instructions: [],
    skills: [],
    mcpServers: [],
    plugins: [],
    hooks: [],
    permissions: [],
    skipped: [],
    warnings: [],
  };
}

export async function buildModel(ctx: DiscoveryContext, agents: Agent[]): Promise<NormalizedModel> {
  const model = emptyModel();
  model.agents = agents;

  for (const agent of agents) {
    const adapter = getAdapter(agent);
    if (!adapter) continue;

    const [instructions, skills, mcp, plugins, settings] = await Promise.all([
      adapter.readInstructions(ctx),
      adapter.readSkills(ctx),
      adapter.readMcp(ctx),
      adapter.readPlugins(ctx),
      adapter.readSettings(ctx),
    ]);

    model.instructions.push(...instructions.items);
    model.skills.push(...skills.items);
    model.mcpServers.push(...mcp.items);
    model.plugins.push(...plugins.items);
    for (const item of settings.items) {
      if ('event' in item) model.hooks.push(item);
      else model.permissions.push(item);
    }

    for (const result of [instructions, skills, mcp, plugins, settings]) {
      model.skipped.push(...result.skipped);
      model.warnings.push(...result.warnings);
    }
  }

  model.instructions.sort((a, b) => a.path.localeCompare(b.path));
  model.skills.sort((a, b) => a.path.localeCompare(b.path));
  model.mcpServers.sort((a, b) => a.name.localeCompare(b.name));
  model.plugins.sort((a, b) => a.name.localeCompare(b.name));
  model.skipped.sort((a, b) => a.path.localeCompare(b.path));
  return model;
}

export interface DoctorReport {
  toolVersion: string;
  rulesVersion: string;
  agentsDetected: Agent[];
  findings: [];
  suppressed: [];
  skipped: NormalizedModel['skipped'];
  warnings: string[];
  model: NormalizedModel;
}

/**
 * Runs discovery and builds the normalized model. Findings and scoring are
 * added in Phase 2 and Phase 3; for now this produces the model plus an
 * empty findings skeleton (docs/scope.md Phase 1 acceptance).
 */
export async function runDoctor(options: RunOptions): Promise<DoctorReport> {
  const ctx = makeDiscoveryContext(options);
  const agents = await detectAgents(ctx, options.agent ?? 'auto');
  const model = await buildModel(ctx, agents);
  return {
    toolVersion: VERSION,
    rulesVersion: RULES_VERSION,
    agentsDetected: agents,
    findings: [],
    suppressed: [],
    skipped: model.skipped,
    warnings: model.warnings,
    model,
  };
}
