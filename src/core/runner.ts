// Orchestrates adapters into the normalized model, then runs rules and
// suppression. Scoring is added in Phase 3. See docs/scope.md section 10.1.

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { getAdapter, knownAgents } from '../adapters/index.js';
import { listDirSafe, pathExists } from '../adapters/fs-utils.js';
import { ALL_RULES } from '../rules/index.js';
import { parseInlineSuppressions, applySuppressions } from './suppress.js';
import { mergeConfig } from './config.js';
import type { SetupDoctorConfig } from './types.js';
import { RULES_VERSION, VERSION } from '../version.js';
import type { Agent, Category, DiscoveryContext, Finding, NormalizedModel, Scope, Severity } from './types.js';

export interface RunOptions {
  path?: string;
  agent?: Agent | 'auto' | 'all';
  scope?: Scope | 'all';
  homeDir?: string;
  config?: Partial<SetupDoctorConfig>;
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

const FIXED_BUILD_MANIFESTS = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Makefile'];

async function detectBuildManifests(ctx: DiscoveryContext): Promise<string[]> {
  const found: string[] = [];
  for (const name of FIXED_BUILD_MANIFESTS) {
    if (await pathExists(join(ctx.projectRoot, name))) found.push(name);
  }
  for (const entry of await listDirSafe(ctx.projectRoot)) {
    if (entry.endsWith('.csproj')) found.push(entry);
  }
  return found.sort();
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
    buildManifests: [],
    skipped: [],
    warnings: [],
  };
}

export async function buildModel(ctx: DiscoveryContext, agents: Agent[]): Promise<NormalizedModel> {
  const model = emptyModel();
  model.agents = agents;
  model.buildManifests = await detectBuildManifests(ctx);

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

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const CATEGORY_ORDER: Record<Category, number> = {
  instructions: 0,
  skills: 1,
  mcp: 2,
  plugins: 3,
  settings: 4,
  freshness: 5,
};

function compareFindings(a: Finding, b: Finding): number {
  const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (severityDiff !== 0) return severityDiff;
  const categoryDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  if (categoryDiff !== 0) return categoryDiff;
  const fileDiff = (a.file ?? '').localeCompare(b.file ?? '');
  if (fileDiff !== 0) return fileDiff;
  return (a.line ?? 0) - (b.line ?? 0);
}

function buildInlineSuppressionMap(model: NormalizedModel): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const file of model.instructions) map.set(file.path, parseInlineSuppressions(file.text));
  for (const skill of model.skills) map.set(skill.path, parseInlineSuppressions(skill.text));
  return map;
}

export function runRules(model: NormalizedModel, config: SetupDoctorConfig): { kept: Finding[]; suppressed: Finding[] } {
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    if (!rule.agents.some((a) => model.agents.includes(a))) continue;
    findings.push(...rule.run({ model, config }));
  }
  findings.sort(compareFindings);
  const inlineByFile = buildInlineSuppressionMap(model);
  const result = applySuppressions(findings, config, inlineByFile);
  result.suppressed.sort(compareFindings);
  return result;
}

export interface DoctorReport {
  toolVersion: string;
  rulesVersion: string;
  agentsDetected: Agent[];
  findings: Finding[];
  suppressed: Finding[];
  skipped: NormalizedModel['skipped'];
  warnings: string[];
  model: NormalizedModel;
}

/**
 * Runs discovery, builds the normalized model, and runs rules and
 * suppression. Scoring is added in Phase 3.
 */
export async function runDoctor(options: RunOptions): Promise<DoctorReport> {
  const ctx = makeDiscoveryContext(options);
  const agents = await detectAgents(ctx, options.agent ?? 'auto');
  const model = await buildModel(ctx, agents);
  const config = mergeConfig(null, options.config ?? {});
  const { kept, suppressed } = runRules(model, config);
  return {
    toolVersion: VERSION,
    rulesVersion: RULES_VERSION,
    agentsDetected: agents,
    findings: kept,
    suppressed,
    skipped: model.skipped,
    warnings: model.warnings,
    model,
  };
}
