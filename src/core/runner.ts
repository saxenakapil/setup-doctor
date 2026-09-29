// Orchestrates adapters into the normalized model, then runs rules and
// suppression. Scoring is added in Phase 3. See docs/scope.md section 10.1.

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { getAdapter, knownAgents } from '../adapters/index.js';
import { listDirSafe, pathExists } from '../adapters/fs-utils.js';
import { ALL_RULES } from '../rules/index.js';
import { parseInlineSuppressions, applySuppressions } from './suppress.js';
import { loadConfigFile, mergeConfig } from './config.js';
import { dedupSharedAcrossAgents } from './dedup.js';
import { computeOverheadTokens, scoreFindings, type ScoreResult } from './scoring.js';
import type { SetupDoctorConfig } from './types.js';
import { RULES_VERSION, VERSION } from '../version.js';
import type { Agent, Category, DiscoveryContext, Finding, NormalizedModel, Scope, SessionRecord, Severity } from './types.js';

export interface RunOptions {
  path?: string;
  agent?: Agent | 'auto' | 'all';
  scope?: Scope | 'all';
  homeDir?: string;
  config?: Partial<SetupDoctorConfig>;
  // --config <path>: an explicit .setupdoctorrc-shaped file to load instead
  // of <projectRoot>/.setupdoctorrc. See docs/scope.md section 7.
  configPath?: string;
}

export function makeDiscoveryContext(options: RunOptions, ignore: string[] = []): DiscoveryContext {
  return {
    projectRoot: resolve(options.path ?? '.'),
    homeDir: options.homeDir ?? homedir(),
    scope: options.scope ?? 'all',
    ignore,
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
    mcpConfigErrors: [],
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
    model.mcpConfigErrors.push(...(mcp.configErrors ?? []));
    for (const item of settings.items) {
      if ('event' in item) model.hooks.push(item);
      else model.permissions.push(item);
    }

    for (const result of [instructions, skills, mcp, plugins, settings]) {
      model.skipped.push(...result.skipped);
      model.warnings.push(...result.warnings);
    }
  }

  // Two or more agents can read the exact same file (e.g. a project's
  // .mcp.json, or .claude/skills, which Copilot CLI also reads directly).
  // Collapse those into one item per real file/entry before rules ever see
  // them, so a genuine problem is scored once, not once per agent that
  // happens to read it. See docs/notes.md's Phase 3 entry.
  model.instructions = dedupSharedAcrossAgents(model.instructions);
  model.skills = dedupSharedAcrossAgents(model.skills);
  model.mcpServers = dedupSharedAcrossAgents(model.mcpServers);
  model.hooks = dedupSharedAcrossAgents(model.hooks);
  model.permissions = dedupSharedAcrossAgents(model.permissions);
  model.mcpConfigErrors = dedupSharedAcrossAgents(model.mcpConfigErrors);

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

export function runRules(
  model: NormalizedModel,
  config: SetupDoctorConfig,
  sessions: SessionRecord[] = [],
): { kept: Finding[]; suppressed: Finding[] } {
  const findings: Finding[] = [];
  const now = new Date().toISOString();
  for (const rule of ALL_RULES) {
    if (!rule.agents.some((a) => model.agents.includes(a))) continue;
    findings.push(...rule.run({ model, config, sessions, now }));
  }
  findings.sort(compareFindings);
  const inlineByFile = buildInlineSuppressionMap(model);
  const result = applySuppressions(findings, config, inlineByFile);
  result.suppressed.sort(compareFindings);
  return result;
}

/**
 * Session logs for SKL-06 and MCP-05 (docs/scope.md Phase 3 note: they stay
 * inactive until session data is available). A 30-day window is enough for
 * their "used in the last 30 days" check while keeping `doctor` fast; never
 * throws, since session logs are optional and doctor must not fail because
 * of them (hard rule 7).
 */
async function collectSessionsForRules(ctx: DiscoveryContext, agents: Agent[]): Promise<SessionRecord[]> {
  const sessions: SessionRecord[] = [];
  for (const agent of agents) {
    const adapter = getAdapter(agent);
    if (!adapter) continue;
    try {
      for await (const record of adapter.readSessions(ctx, { kind: '30d' })) {
        sessions.push(record);
      }
    } catch {
      // Session logs are best-effort for doctor; ignore failures here.
    }
  }
  return sessions;
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
  score: ScoreResult['score'];
  band: ScoreResult['band'];
  capped: boolean;
  categories: ScoreResult['categories'];
  overheadTokens: number;
}

/**
 * Runs discovery, builds the normalized model, runs rules and suppression,
 * and scores the result (docs/scope.md section 10.4).
 */
export async function runDoctor(options: RunOptions): Promise<DoctorReport> {
  const projectRoot = resolve(options.path ?? '.');
  // Config is loaded before discovery, not after: its `ignore` field must
  // already be known so buildModel's directory walks can skip ignored
  // paths entirely, rather than discovering and then discarding them.
  const { raw: fileConfig, warnings: configWarnings } = await loadConfigFile(projectRoot, options.configPath);
  const config = mergeConfig(fileConfig, options.config ?? {});
  const ctx = makeDiscoveryContext(options, config.ignore);
  const agents = await detectAgents(ctx, options.agent ?? 'auto');
  const model = await buildModel(ctx, agents);
  const sessions = await collectSessionsForRules(ctx, agents);
  const { kept, suppressed } = runRules(model, config, sessions);
  const { score, band, capped, categories } = scoreFindings(kept, model);
  return {
    toolVersion: VERSION,
    rulesVersion: RULES_VERSION,
    agentsDetected: agents,
    findings: kept,
    suppressed,
    skipped: model.skipped,
    warnings: [...configWarnings, ...model.warnings],
    model,
    score,
    band,
    capped,
    categories,
    overheadTokens: computeOverheadTokens(model),
  };
}
