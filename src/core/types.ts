// Shared types for the normalized model, adapters and rules.
// See docs/scope.md section 9 (and 8.1 for the subagent and @import additions).

export type Agent = 'claude' | 'codex' | 'cursor' | 'copilot';
export type Scope = 'global' | 'project';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'instructions' | 'skills' | 'mcp' | 'plugins' | 'settings' | 'freshness';

export interface SourceRef {
  agent: Agent;
  scope: Scope;
  path: string;
  sizeBytes: number;
  // Other agents that read this exact same file (e.g. Copilot CLI reading
  // .claude/skills). Populated by buildModel's cross-agent dedup pass, not
  // by adapters themselves. See docs/notes.md's Phase 3 entry.
  sharedWith?: Agent[];
}

// Path or script references found in a project instruction file (INS-06).
// Adapters resolve `exists` (FS access) so INS-06 itself stays a pure
// function of the model.
export interface StaleReference {
  target: string;
  line: number;
  kind: 'path' | 'script';
  exists: boolean;
}

export interface InstructionFile extends SourceRef {
  text: string;
  lines: string[];
  estTokens: number;
  staleReferences: StaleReference[];
}

export interface RelativeRef {
  target: string;
  line: number;
  exists: boolean;
}

export interface Skill extends SourceRef {
  kind: 'skill' | 'agent';
  folder: string;
  name?: string;
  description?: string;
  frontmatterValid: boolean;
  frontmatterError?: string;
  lineCount: number;
  text: string;
  relativeRefs: RelativeRef[];
}

export interface McpServer {
  agent: Agent;
  scope: Scope;
  sourcePath: string;
  name: string;
  command?: string;
  url?: string;
  args: string[];
  secretLikeEnvKeys: string[];
  disabled: boolean;
  // Whether a stdio `command` was found on PATH (MCP-01b). undefined when not
  // applicable (a `url` server, no command, or disabled). Computed by the
  // adapter, which does the PATH/filesystem check, so the rule stays pure.
  commandFound?: boolean;
  // See SourceRef.sharedWith.
  sharedWith?: Agent[];
}

export interface PluginInfo {
  agent: Agent;
  name: string;
  version?: string;
  manifestPath: string;
  manifestValid: boolean;
  manifestError?: string;
  skillNames: string[];
  commandNames: string[];
  enabled: boolean;
}

// Result of resolving a hook's script path against disk (SET-02). Present
// only when the hook's first token looked like a path. Computed by the
// adapter so the rule stays pure.
export interface HookScriptCheck {
  resolvedPath: string;
  exists: boolean;
  // Always true on Windows (no exec bit); real posix check otherwise.
  executable: boolean;
}

export interface HookDef {
  agent: Agent;
  scope: Scope;
  sourcePath: string;
  event: string;
  command: string;
  scriptCheck?: HookScriptCheck;
  // See SourceRef.sharedWith.
  sharedWith?: Agent[];
}

export interface PermissionRule {
  agent: Agent;
  scope: Scope;
  sourcePath: string;
  kind: 'allow' | 'deny' | 'ask';
  rule: string;
  // See SourceRef.sharedWith.
  sharedWith?: Agent[];
}

export interface SessionUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SessionRecord {
  agent: Agent;
  sessionId: string;
  project: string;
  ts: string;
  kind: 'user' | 'assistant';
  model?: string;
  usage?: SessionUsage;
  tools: string[];
}

export interface Skipped {
  path: string;
  reason: string;
}

// A config file that exists but failed to parse (MCP-01a). Kept separate
// from the free-text `warnings` list so MCP-01 can read it as data.
export interface ConfigError {
  agent: Agent;
  scope: Scope;
  sourcePath: string;
  message: string;
  // See SourceRef.sharedWith.
  sharedWith?: Agent[];
}

export interface AdapterResult<T> {
  items: T[];
  skipped: Skipped[];
  warnings: string[];
  unsupported?: boolean;
  configErrors?: ConfigError[];
}

export interface FindingExample {
  before: string;
  after: string;
}

// Machine-readable instructions for fix mode (docs/scope.md section 14),
// populated only by rules in the fixable safe set. Not part of scope.md's
// literal Finding sketch; added because a human-readable `fix` string isn't
// enough for fix mode to compute an actual edit. `kind` is extensible for
// future safe-fix rules beyond line removal.
export interface RemoveLinesFixHint {
  kind: 'remove-lines';
  lines: number[]; // 1-indexed line numbers to delete, keeping everything else
}

// SET-02's safe fix: a hook entry that points to a missing/non-executable
// script is dead weight (it cannot ever run), so removing it changes no
// real behavior. Identifies the hook structurally (event + its own command
// string), not by line number, since fixing it means a real JSON edit
// (removing an array element, which JSON.stringify re-serializes correctly
// including comma placement), not a text-level line deletion. See
// src/adapters/claude-settings-shape.ts's `removeHookFromSettingsJson`.
export interface RemoveHookFixHint {
  kind: 'remove-hook';
  event: string;
  command: string;
}

export type FixHint = RemoveLinesFixHint | RemoveHookFixHint;

export interface Finding {
  ruleId: string;
  category: Category;
  severity: Severity;
  agent?: Agent;
  // Other agents that also read the file this finding is about (e.g. a
  // shared .mcp.json read by both Claude Code and Copilot CLI). Absent
  // when the underlying file is only ever read by `agent`. See
  // SourceRef.sharedWith; propagated onto the Finding by the rule that
  // builds it, from the model item's own sharedWith.
  sharedWith?: Agent[];
  file?: string;
  line?: number;
  message: string;
  why: string;
  fix: string;
  example?: FindingExample;
  possible?: boolean;
  tokensSaved?: number;
  fixable?: boolean;
  fixHint?: FixHint;
}

export type PeriodKind = '7d' | '30d' | 'ytd' | 'all' | 'range';

export interface Period {
  kind: PeriodKind;
  start?: string; // 'range' kind only: YYYY-MM-DD, inclusive
  end?: string; // 'range' kind only: YYYY-MM-DD, inclusive
  // IANA zone for boundary math (ytd, range, active-day bucketing). Not part
  // of docs/scope.md's Period sketch; added because the Adapter.readSessions
  // signature takes only (ctx, period) and tz-aware filtering needs it.
  tz?: string;
}

export interface DiscoveryContext {
  projectRoot: string;
  homeDir: string;
  scope: Scope | 'all';
  // Glob patterns (relative to projectRoot) to exclude from discovery,
  // from .setupdoctorrc's `ignore` field. Applies only to project-scope
  // paths: global paths (under homeDir) are never matched against it,
  // the same way .gitignore only ever applies within a repo.
  ignore: string[];
}

export interface Adapter {
  agent: Agent;
  detect(ctx: DiscoveryContext): Promise<boolean>;
  readInstructions(ctx: DiscoveryContext): Promise<AdapterResult<InstructionFile>>;
  readSkills(ctx: DiscoveryContext): Promise<AdapterResult<Skill>>;
  readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>>;
  readPlugins(ctx: DiscoveryContext): Promise<AdapterResult<PluginInfo>>;
  readSettings(ctx: DiscoveryContext): Promise<AdapterResult<HookDef | PermissionRule>>;
  readSessions(ctx: DiscoveryContext, period: Period): AsyncIterable<SessionRecord>;
}

export interface NormalizedModel {
  agents: Agent[];
  instructions: InstructionFile[];
  skills: Skill[];
  mcpServers: McpServer[];
  plugins: PluginInfo[];
  hooks: HookDef[];
  permissions: PermissionRule[];
  // Build manifest filenames present at the project root (INS-07), e.g. "package.json".
  buildManifests: string[];
  // MCP config files that exist but failed to parse (MCP-01a).
  mcpConfigErrors: ConfigError[];
  skipped: Skipped[];
  warnings: string[];
}

export interface Thresholds {
  [ruleId: string]: Record<string, number>;
}

export interface SetupDoctorConfig {
  agent: Agent | 'auto';
  scope: Scope | 'all';
  theme: 'playful' | 'technical' | 'mix';
  minSeverity: Severity;
  disabledRules: string[];
  thresholds: Thresholds;
  // Glob patterns (relative to the project root) to exclude from
  // discovery entirely: not read, not scored, not reported as skipped.
  // See src/adapters/glob.ts for the supported syntax.
  ignore: string[];
}

export interface RuleContext {
  model: NormalizedModel;
  config: SetupDoctorConfig;
  sessions?: SessionRecord[];
  // ISO timestamp used as "now" for session-window rules (SKL-06, MCP-05).
  // Explicit rather than Date.now() inside the rule, so results stay
  // reproducible in tests and don't silently drift day to day.
  now?: string;
}

export interface Rule {
  id: string;
  category: Category;
  title: string;
  agents: Agent[];
  heuristic: boolean;
  needsSessions?: boolean;
  fixable?: boolean;
  // Static metadata for `setup-doctor rules` / `explain`, kept alongside the
  // rule so this text lives in one place instead of scattered fix strings.
  severityLabel: string;
  why: string;
  fix: string;
  run(ctx: RuleContext): Finding[];
}
