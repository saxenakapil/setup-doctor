// Shared types for the normalized model, adapters and rules.
// See docs/scope.md section 9 (and 8.1 for the subagent and @import additions).

export type Agent = 'claude' | 'codex' | 'cursor';
export type Scope = 'global' | 'project';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'instructions' | 'skills' | 'mcp' | 'plugins' | 'settings' | 'freshness';

export interface SourceRef {
  agent: Agent;
  scope: Scope;
  path: string;
  sizeBytes: number;
}

export interface InstructionFile extends SourceRef {
  text: string;
  lines: string[];
  estTokens: number;
}

export interface RelativeRef {
  target: string;
  line: number;
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

export interface HookDef {
  agent: Agent;
  scope: Scope;
  sourcePath: string;
  event: string;
  command: string;
}

export interface PermissionRule {
  agent: Agent;
  scope: Scope;
  sourcePath: string;
  kind: 'allow' | 'deny' | 'ask';
  rule: string;
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

export interface AdapterResult<T> {
  items: T[];
  skipped: Skipped[];
  warnings: string[];
  unsupported?: boolean;
}

export interface FindingExample {
  before: string;
  after: string;
}

export interface Finding {
  ruleId: string;
  category: Category;
  severity: Severity;
  agent?: Agent;
  file?: string;
  line?: number;
  message: string;
  why: string;
  fix: string;
  example?: FindingExample;
  possible?: boolean;
  tokensSaved?: number;
  fixable?: boolean;
}

export type PeriodKind = '7d' | '30d' | 'ytd' | 'all' | 'range';

export interface Period {
  kind: PeriodKind;
  start?: string;
  end?: string;
}

export interface DiscoveryContext {
  projectRoot: string;
  homeDir: string;
  scope: Scope | 'all';
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
}

export interface RuleContext {
  model: NormalizedModel;
  config: SetupDoctorConfig;
  sessions?: SessionRecord[];
}

export interface Rule {
  id: string;
  category: Category;
  title: string;
  agents: Agent[];
  heuristic: boolean;
  needsSessions?: boolean;
  fixable?: boolean;
  run(ctx: RuleContext): Finding[];
}
