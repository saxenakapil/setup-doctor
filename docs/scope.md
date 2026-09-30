# Setup Doctor: Frozen Scope (v1)

Status: FROZEN. This is the single source of truth for building v1. Companion documents: `rules.md` (every Doctor rule), `themes.md` (visual tokens and layouts). The origin is the functional specification plus the decisions in section 2.

## 0. How to use this document (for Claude Code)

- Build exactly what is written here, in the phase order of section 18.
- Do not add features. If a detail is missing, choose the simplest option consistent with sections 2 to 4 and record it in `docs/notes.md` under "Assumptions". Do not stop to ask.
- If this document conflicts with `rules.md`, `rules.md` wins for rule behavior. If it conflicts with `themes.md`, `themes.md` wins for visuals. Otherwise this document wins.
- After each phase: run `npm run check`, then commit with the phase name.
- Values marked "(default)" are starting values to tune against real setups. Keep them in `src/core/defaults.ts` or `src/data/`, never scattered in code.
- Use only English text in v1. Do not use em dashes anywhere.

## 1. Product summary

Setup Doctor is a free, open-source, local-only tool for developers who use AI coding agents. It has two features on one core:

- **Doctor:** audits instruction files, skills, MCP servers, plugins, settings and hooks. Returns a 0 to 100 score, findings, and a concrete fix for each finding.
- **Wrapped:** summarizes usage over a period from local session logs and renders a shareable card.

It also produces a README badge (static and endpoint style), an HTML report, a JSON report, and three visual themes.

Distribution: one npm package (`npx setup-doctor`) and one Claude plugin (skills that call the CLI), both from this repository.

Target users: developers who use Claude Code daily (primary), plus Codex and Cursor users (secondary). Non-developer Claude users are out of scope for v1.

## 2. Frozen decisions

| Topic | Decision |
| --- | --- |
| Package and CLI name | `setup-doctor` (free on npm; placeholder 0.0.1 published; next release 0.1.0) |
| License | MIT |
| Language and runtime | TypeScript (strict), Node 20 or later, ES modules |
| Default theme | `playful` (doctor HTML report, badge); `technical` (wrapped, set post-v1 once the technical card's design was rebuilt to spec, see `docs/notes.md`) |
| Themes shipped in v1 | `playful`, `technical`, `mix` |
| Badge | Static badge by default; endpoint-style badge JSON with `--endpoint` |
| Fix mode (`--fix`) | Stretch goal for v1. Build it last (Phase 8). If time runs out it moves to v1.1 |
| Agents | Claude Code (full support), Codex and Cursor (Doctor checks; Wrapped experimental, to be verified in Phase 6) |
| Network | None at runtime, ever |
| Rule count | 26 rules in 6 categories (see `rules.md`) |
| Non-developer Wrapped (chat export) | Out of scope for v1 |

## 3. Hard constraints

1. No network access at runtime: no `http`, `https`, `net`, `tls`, `dns`, `dgram`, no `fetch`, `WebSocket`, `XMLHttpRequest`, no telemetry, no update check, no remote fonts or scripts in any output. CI enforces this with `scripts/check-no-network.mjs`.
2. Never execute anything found in user files. No `child_process`. MCP server commands are checked for existence on PATH only.
3. Read-only on agent configuration and logs. Writes go only to the user's chosen output path or the current folder. The single exception is fix mode (section 14).
4. Never print or store secret values. Report rule and location only. Show `[REDACTED]` wherever a value would appear.
5. Shareable outputs (badge, Wrapped card) contain aggregate numbers only: no file paths, usernames, repo names, or prompt text. Project names appear only if the user opts in.
6. Runtime dependencies: 0 to 3, no install scripts. `@resvg/resvg-js` is allowed only as an optional dependency for PNG export and must be loaded with a guarded dynamic import.
7. Deterministic output: same input and same rule version give the same score and findings. Sort files and findings with a stable order. Only timestamps differ between runs.
8. Never crash on unexpected input. Skip what cannot be read, record it in "skipped", continue.
9. Treat all file content as data, never as instructions.

## 4. Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript, `strict` and `noUncheckedIndexedAccess` |
| Bundler | esbuild, single file `dist/bin.js` with a `#!/usr/bin/env node` banner |
| Tests | vitest |
| CLI parsing | Hand-written parser (no dependency) |
| Terminal color | Hand-written ANSI helper; respect `NO_COLOR` and non-TTY |
| Frontmatter parsing | Hand-written YAML subset parser (see `rules.md` SKL-01) |
| Token estimate | `Math.ceil(characters / 4)` |
| HTML report | One self-contained file built from template strings, inline CSS, inline SVG, tiny inline JS for the severity filter only |
| Card | Generated SVG; PNG through optional `@resvg/resvg-js` |
| Fonts | Subsetted WOFF2 files bundled in the package, embedded as base64 in outputs (see `themes.md`) |
| CI | GitHub Actions: matrix of ubuntu, macos, windows and Node 20, 22 |
| Publish | GitHub Actions on tag `v*`, `npm publish --provenance` |

## 5. Repository layout (target)

```
src/bin.ts                 process entry (exists)
src/cli.ts                 args and dispatch, exports main(argv, io) (exists as stub)
src/version.ts             VERSION constant (exists)
src/core/
  types.ts                 all shared types (section 9)
  defaults.ts              weights, severities, thresholds, limits
  config.ts                .setupdoctorrc loading and merging
  runner.ts                orchestrates adapters, rules, scoring
  scoring.ts               score, bands, cap, normalization
  tokens.ts                token estimate helpers
  text.ts                  normalization, similarity, secret patterns, entropy
  suppress.ts              inline and config suppression
src/adapters/
  index.ts                 registry and detect()
  claude-code.ts
  codex.ts
  cursor.ts
  frontmatter.ts           YAML subset parser
src/rules/                 one file per rule: ins-01.ts ... frs-02.ts, plus index.ts registry
src/wrapped/
  parse-claude.ts          streaming JSONL reader
  metrics.ts               aggregation
  persona.ts               persona rules
  prices.ts                price table matching and cost
src/render/
  terminal.ts  html.ts  json.ts  badge.ts  card.ts
  themes/index.ts  themes/playful.ts  themes/technical.ts  themes/mix.ts
  fonts.ts                 embedded font loading
src/data/
  prices.json  retired-models.ts  vague-rules.ts  fonts/ (subsetted woff2 and licenses)
skills/doctor/SKILL.md     plugin skill (exists)
skills/wrapped/SKILL.md    plugin skill (exists)
.claude-plugin/            plugin.json and marketplace.json (exist)
scripts/                   build.mjs, check-no-network.mjs, check-version-sync.mjs (exist)
test/                      *.test.ts and fixtures/ (one fixture folder per scenario)
docs/                      scope.md, rules.md, themes.md, notes.md, examples/
```

## 6. Commands, flags and exit codes

Running `setup-doctor` with no command runs `doctor` on the current folder.

### 6.1 Commands

| Command | Purpose |
| --- | --- |
| `setup-doctor [doctor] [path]` | Audit the setup and print the score. `path` defaults to the current folder |
| `setup-doctor wrapped` | Usage summary and card |
| `setup-doctor badge` | Write badge files and print the Markdown snippet |
| `setup-doctor rules` | List all rules with ID, category, severity and whether each is enabled |
| `setup-doctor explain <RULE_ID>` | Print what the rule checks, why it matters, and how to fix it |
| `--help`, `-h`, `--version` | Standard behavior |

### 6.2 Flags

| Flag | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `--agent claude\|codex\|cursor\|all` | all | auto-detect | Which agent setups to read |
| `--scope project\|global\|all` | doctor | `all` | Which locations to check |
| `--format terminal\|json\|html` | doctor, wrapped | `terminal` | Output format |
| `--out <path>` | all | current folder | Where output files are written (a folder) |
| `--theme playful\|technical\|mix` | html report, card, badge svg | `playful` (html report, badge svg); `technical` (card) | Visual theme. Unknown value exits with code 2 and lists valid names |
| `--min-severity low\|medium\|high\|critical` | doctor | `low` | Hide findings below this level (score is unaffected) |
| `--period <value>` | wrapped | `30d` | `7d`, `30d`, `ytd`, `all`, or `YYYY-MM-DD:YYYY-MM-DD` |
| `--tz <IANA zone>` | wrapped | local | Time zone for hour and weekday buckets |
| `--anonymize` | wrapped | off | Hide project names in every output |
| `--no-cost` | wrapped | off | Remove cost figures |
| `--show-projects` | wrapped | off | Show project names on the card (default hides them) |
| `--endpoint` | badge | off | Also write the shields.io endpoint JSON |
| `--fail-under <n>` | doctor | off | With `--ci`, exit 1 if the score is below n |
| `--ci` | doctor | off | No prompts, no color, stable output |
| `--fix` | doctor | off | Fix mode (section 14, Phase 8, stretch) |
| `--dry-run` | doctor with `--fix` | off | Show diffs, change nothing |
| `--allow-dirty` | doctor with `--fix` | off | Allow editing files with uncommitted git changes |
| `--config <path>` | all | `.setupdoctorrc` | Configuration file |
| `--yes` | all | off | Overwrite existing output files without asking |
| `--no-color`, `--verbose` | all | off | Standard. Verbose logs stay on the local terminal |

### 6.3 Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, including "nothing to check" |
| 1 | Score below `--fail-under` in CI mode |
| 2 | Usage error (unknown flag, bad period, bad theme, missing rule ID) |
| 3 | Data unreadable or unsupported, and nothing usable was parsed |
| 4 | Internal error. The message says how to file an issue |

### 6.4 Plugin skills

The plugin exposes two skills, `doctor` and `wrapped` (files exist in `skills/`). They call the CLI through `npx setup-doctor`. Plugin skills are namespaced, so the full invocation is likely `/setup-doctor:doctor` and `/setup-doctor:wrapped`.

## 7. Configuration file

Optional file `.setupdoctorrc` (JSON) in the project root. Precedence: command-line flags, then `.setupdoctorrc`, then defaults.

```json
{
  "agent": "auto",
  "scope": "all",
  "theme": "playful",
  "minSeverity": "low",
  "disabledRules": ["INS-04"],
  "thresholds": {
    "INS-02": { "warnTokens": 2000, "highTokens": 5000 },
    "SKL-04": { "maxLines": 500 },
    "MCP-04": { "maxServers": 8 }
  }
}
```

- Unknown keys produce a warning and are ignored. Invalid JSON produces exit code 2 with the parse error location.
- Inline suppression in Markdown files: `<!-- doctor-ignore INS-04 -->` disables that rule for that file. Multiple IDs may be separated by commas.
- Suppressed findings do not affect the score. They are counted and listed separately in reports.

## 8. Discovery: what the adapters read

Paths below are the expected locations. Adapters must tolerate any of them being absent, and must verify them against real installs in the phase noted. `~` is the user home folder. On Windows use the equivalent home folder.

### 8.1 Claude Code (Phase 1)

| Input | Global | Project |
| --- | --- | --- |
| Instruction files | `~/.claude/CLAUDE.md` | `./CLAUDE.md`, `./.claude/CLAUDE.md`, `./CLAUDE.local.md`, and nested `CLAUDE.md` files up to depth 5 |
| Skills | `~/.claude/skills/*/SKILL.md` | `./.claude/skills/*/SKILL.md` |
| Subagents | `~/.claude/agents/*.md` | `./.claude/agents/*.md` |
| MCP servers | `~/.claude.json` (`mcpServers` key) | `./.mcp.json` (`mcpServers` key) |
| Plugins | `~/.claude/plugins/` (installed plugin folders with `.claude-plugin/plugin.json`) | none |
| Settings, permissions, hooks, enabled plugins | `~/.claude/settings.json` | `./.claude/settings.json`, `./.claude/settings.local.json` |
| Session logs (Wrapped) | `~/.claude/projects/<encoded-project>/*.jsonl` | |

Subagent files are modeled and read as `Skill` items (section 9): a subagent file has the same frontmatter shape (`name`, `description`) as a `SKILL.md`. The adapter tags each `Skill` with its source kind (`skill` or `agent`) so rule messages can say "subagent" instead of "skill", but SKL-01 through SKL-06 run against both kinds unchanged. This keeps the rule count and category weights as specified; no new rule IDs or category is introduced for subagents.

CLAUDE.md files may contain `@path/to/file` import directives (a line consisting of `@` followed by a relative or `~`-prefixed path). The adapter must resolve these before computing `estTokens` or running INS-06 (stale references): read the imported file, splice its content in place of the `@import` line, and recurse up to the same depth 5 limit used for nested instruction files (section 8.4), so a cycle cannot cause unbounded recursion. An import that does not resolve is recorded as a warning (not a finding) and left as literal text. This must ship in Phase 1: instruction size and stale-reference checks are wrong for any project using imports until it is in place.

### 8.2 Codex (Phase 6)

| Input | Location |
| --- | --- |
| Instruction files | `./AGENTS.md`, nested `AGENTS.md` up to depth 5, `~/.codex/AGENTS.md` |
| Config and MCP servers | `~/.codex/config.toml` (parse only the keys needed; a minimal TOML reader for tables and key-value pairs) |
| Session logs (experimental) | `~/.codex/sessions/` if present |

### 8.3 Cursor (Phase 6)

| Input | Location |
| --- | --- |
| Instruction files | `./.cursorrules`, `./.cursor/rules/*.mdc` and `*.md` |
| MCP servers | `./.cursor/mcp.json`, `~/.cursor/mcp.json` |
| Session logs (experimental) | none known; Wrapped for Cursor reports "not supported yet" unless a usable local source is verified |

### 8.4 Discovery rules

- An agent counts as detected when its global folder exists or any of its project files exist. With `--agent auto`, run every detected agent. With no agent detected: print "Nothing to check" with a hint to use `--agent` or `path`, exit 0.
- Depth limit for nested instruction files: 5. Skip `node_modules`, `.git`, `dist`, `build`, `.venv`, `vendor`.
- Skip files over 10 MB with a warning. Detect symlink loops and skip them.
- All paths reported to the user are relative to the project root where possible, and `~`-prefixed for global files.

## 9. Normalized model and result types

Adapters return these types. Rules and engines only see these types. Put them in `src/core/types.ts`.

```ts
type Agent = 'claude' | 'codex' | 'cursor';
type Scope = 'global' | 'project';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type Category = 'instructions' | 'skills' | 'mcp' | 'plugins' | 'settings' | 'freshness';

interface SourceRef { agent: Agent; scope: Scope; path: string; sizeBytes: number }

// Path or script token found in a project instruction file (INS-06). The
// adapter resolves `exists` (it already does filesystem reads) so the rule
// stays a pure function of the model.
interface StaleReference { target: string; line: number; kind: 'path' | 'script'; exists: boolean }

interface InstructionFile extends SourceRef {
  text: string; lines: string[]; estTokens: number;
  staleReferences: StaleReference[];   // project-scope files only; see INS-06
}

interface Skill extends SourceRef {
  kind: 'skill' | 'agent';      // 'agent' for subagent files, section 8.1
  folder: string;               // skill (or agent) folder path
  name?: string;
  description?: string;
  frontmatterValid: boolean;
  frontmatterError?: string;
  lineCount: number;
  text: string;
  relativeRefs: { target: string; line: number; exists: boolean }[];   // relative links and paths found in the body; exists resolved by the adapter (SKL-05)
}

interface McpServer {
  agent: Agent; scope: Scope; sourcePath: string; name: string;
  command?: string; url?: string; args: string[];
  secretLikeEnvKeys: string[];   // computed in the adapter; env AND header VALUES are never kept
  disabled: boolean;
  commandFound?: boolean;        // MCP-01b; PATH lookup done by the adapter (src/adapters/path-check.ts), undefined when not applicable
}

interface PluginInfo {
  agent: Agent; name: string; version?: string; manifestPath: string;
  manifestValid: boolean; manifestError?: string;
  skillNames: string[]; commandNames: string[]; enabled: boolean;
}

// Result of resolving a hook's script path against disk (SET-02). Present only
// when the hook's first token looked like a path. executable is always true
// on Windows, which has no exec bit.
interface HookScriptCheck { resolvedPath: string; exists: boolean; executable: boolean }

interface HookDef { agent: Agent; scope: Scope; sourcePath: string; event: string; command: string; scriptCheck?: HookScriptCheck }
interface PermissionRule { agent: Agent; scope: Scope; sourcePath: string; kind: 'allow' | 'deny' | 'ask'; rule: string }

interface SessionRecord {
  agent: Agent; sessionId: string; project: string; ts: string;   // ISO 8601
  kind: 'user' | 'assistant'; model?: string;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  tools: string[];               // tool names called in this record
}

// A config file that exists but failed to parse (MCP-01a), kept as data
// separate from the free-text warnings list.
interface ConfigError { agent: Agent; scope: Scope; sourcePath: string; message: string }

interface AdapterResult<T> {
  items: T[];
  skipped: { path: string; reason: string }[];
  warnings: string[];
  unsupported?: boolean;         // the agent does not provide this input
  configErrors?: ConfigError[];  // MCP-01a; only readMcp populates this today
}

interface Finding {
  ruleId: string; category: Category; severity: Severity; agent?: Agent;
  file?: string; line?: number;
  message: string; why: string; fix: string;
  example?: { before: string; after: string };
  possible?: boolean;            // heuristic finding
  tokensSaved?: number; fixable?: boolean;
}

interface Adapter {
  agent: Agent;
  detect(ctx: DiscoveryContext): Promise<boolean>;
  readInstructions(ctx: DiscoveryContext): Promise<AdapterResult<InstructionFile>>;
  readSkills(ctx: DiscoveryContext): Promise<AdapterResult<Skill>>;
  readMcp(ctx: DiscoveryContext): Promise<AdapterResult<McpServer>>;
  readPlugins(ctx: DiscoveryContext): Promise<AdapterResult<PluginInfo>>;
  readSettings(ctx: DiscoveryContext): Promise<AdapterResult<HookDef | PermissionRule>>;
  readSessions(ctx: DiscoveryContext, period: Period): AsyncIterable<SessionRecord>;
}
```

Adapter rules: each adapter has its own parser modules and detects the data format version. An unknown format returns partial results plus a warning, never an exception. Adapters never import each other. Adapters make no network calls and no writes.

## 10. Doctor engine

### 10.1 Pipeline

1. Load config. 2. Detect agents. 3. Run adapters to build the normalized model. 4. Run every enabled rule whose `agents` include a detected agent. 5. Apply suppressions. 6. Score. 7. Render.

### 10.2 Categories and weights (default)

| Category | Weight | Rules |
| --- | --- | --- |
| Instruction files | 30 | INS-01 to INS-08 |
| Skills | 25 | SKL-01 to SKL-06 |
| MCP servers | 15 | MCP-01 to MCP-05 |
| Plugins | 10 | PLG-01 to PLG-03 |
| Settings and hooks | 10 | SET-01, SET-02 |
| Freshness | 10 | FRS-01, FRS-02 |

### 10.3 Applicability

A category is applicable when at least one relevant input exists: Instruction files is always applicable (INS-01 covers absence); Skills needs at least one skill; MCP needs at least one server; Plugins needs at least one plugin; Settings needs at least one settings file, hook or permission rule; Freshness needs at least one instruction file or skill. Non-applicable categories are excluded and the remaining weights are scaled to total 100. If no category is applicable, report "Not enough to score", print no score, and produce no badge.

### 10.4 Scoring algorithm

1. Deduction points per finding: critical 10, high 5, medium 2, low 1.
2. For each applicable category: `deductions = sum of points`. Deductions from findings marked `possible` are capped at 50 percent of the category weight in total.
3. `categoryFraction = max(0, weight - deductions) / weight`.
4. `effectiveWeight = weight * 100 / sum(weights of applicable categories)`.
5. `total = round(sum(categoryFraction * effectiveWeight))`.
6. If any critical finding exists, `total = min(total, 74)` and the report says the score is capped.
7. Bands: 90 to 100 Excellent, 75 to 89 Good, 50 to 74 Needs work, 0 to 49 Poor.

### 10.5 Token overhead estimate

`alwaysLoadedTokens` = estimated tokens of all instruction files that apply to the project (global plus project files) plus the estimated tokens of every skill description. MCP tool definitions are not measured in v1; report the server count instead.

### 10.6 Findings

Every finding has the fields in the `Finding` type. Findings are sorted by severity (critical first), then category order, then file path, then line. Group repeated findings of the same rule and file for the terminal report (show the first 3), and list all in HTML and JSON.

### 10.7 The rules

All 26 rules are specified in `rules.md`. Implement them exactly as written there.

## 11. Wrapped engine

### 11.1 Inputs

Claude Code session logs: JSONL files, one JSON object per line. Expected fields (verify against real logs in Phase 5 and record in `docs/notes.md`; read defensively, ignore lines that do not parse):

- `timestamp` (ISO string), `sessionId`, `type` (`user` or `assistant`)
- `message.model`, `message.id`
- `message.usage.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- `message.content[]` items with `type: 'tool_use'` and `name`
- `requestId` when present

Deduplicate assistant records by the pair (`message.id`, `requestId`); count each unique pair once. Read files as streams, line by line. Parse only these metadata fields and drop message text immediately. Never hold message text in memory beyond the current line.

### 11.2 Periods

`--period` accepts `7d`, `30d` (default), `ytd`, `all`, or `YYYY-MM-DD:YYYY-MM-DD`. Boundaries use the local time zone or `--tz`. Bad values exit with code 2.

### 11.3 Metrics

| Metric | Definition |
| --- | --- |
| Sessions | Count of distinct sessions with at least one record in the period |
| Active days | Days (local) with at least one record |
| Longest streak | Most consecutive active days |
| Tokens | Totals of input, output, cache read, cache write |
| Cache hit rate | `cacheRead / (input + cacheRead + cacheWrite)` |
| Estimated cost | Sum over models of tokens times price (11.4). Label: "API-equivalent estimate, not your bill" |
| Top models | Share of total tokens per model, top 3 |
| Busiest hour and weekday | Hour (0 to 23) and weekday with the most user records |
| Longest session | Largest gap between first and last record within one session |
| Top tools | Most called tool names, top 5 |
| Top projects | Projects ranked by total tokens, top 5. Local report only unless the user opts in |

### 11.4 Price table

Stored in `src/data/prices.json` with an `asOf` date. Starting values below were collected on 2026-09-29 and must be verified against Anthropic's published pricing during Phase 5. USD per million tokens. Match model IDs by pattern.

| Pattern | Input | Output | Cache read multiplier | Cache write multiplier |
| --- | --- | --- | --- | --- |
| `haiku-4-5` | 1 | 5 | 0.10 | 1.25 |
| `sonnet-4-6` | 3 | 15 | 0.10 | 1.25 |
| `sonnet-5` | 2 | 10 | 0.10 | 1.25 |
| `opus-4-6`, `opus-4-7`, `opus-4-8` | 5 | 25 | 0.10 | 1.25 |
| `opus-5` (not `opus-5-5`) | 5 | 25 | 0.10 | 1.25 |
| `opus-5-5` | 4 | 20 | 0.05 | 1.25 |
| `fable-5` | 10 | 50 | 0.10 | 1.25 |

An unknown model shows tokens, and its cost reads "n/a" with a footnote. The output always shows the table date. Subscription users see a note that cost is an API-equivalent figure.

### 11.5 Persona labels (first match wins, in this order)

| Label | Rule | Card line |
| --- | --- | --- |
| Night Owl | 40 percent or more of user records between 22:00 and 04:00 | Most of your messages land after dark. |
| Marathoner | Longest session over 4 hours | Your longest session ran past 4 hours. |
| Cache Master | Cache hit rate over 90 percent | Your cache did the heavy lifting. |
| Streak Keeper | Longest streak of 14 days or more | You showed up day after day. |
| Steady Builder | Default | Steady, consistent use. |

### 11.6 Privacy controls

`--anonymize` hides project names everywhere including the local report. `--no-cost` removes cost. Project names never appear on the card unless the user passes `--show-projects` (add this flag; default off). The parser reads metadata only.

### 11.7 Other agents

Codex and Cursor Wrapped are experimental. In Phase 6, check whether a readable local source exists. If yes, map it to `SessionRecord` and label the output "experimental". If not, print "Wrapped is not supported for <agent> yet" and exit 0.

## 12. Outputs

| Output | Format | Command | Notes |
| --- | --- | --- | --- |
| Terminal report | Text, ANSI color | `doctor`, `wrapped` | Not themed. `NO_COLOR` respected. Plain when not a TTY |
| HTML report | One self-contained file `setup-doctor-report.html` | `doctor --format html` | Themed. All CSS, fonts and JS inline. No network. Strict Content-Security-Policy. All file-derived text escaped. Secret values always `[REDACTED]`. Footer reminds that local reports may contain file paths |
| JSON | `setup-doctor-report.json` or stdout | `--format json` | `schemaVersion: 1`. Includes tool version, `rulesVersion`, theme, score, categories, findings, suppressed, skipped, overhead |
| Badge (static) | `setup-doctor-badge.svg` plus printed Markdown | `badge` | Score and band only |
| Badge (endpoint) | `setup-doctor-badge.json` | `badge --endpoint` | shields.io endpoint schema |
| Wrapped card | `setup-doctor-wrapped-1200x630.svg` and `-1080x1350.svg`; PNG when `@resvg/resvg-js` is present | `wrapped` | Themed. Aggregate numbers only |

### 12.1 Terminal report layout (Doctor)

```
Setup Doctor  score 79/100  (Good)   rules v1.0.0

Instruction files  22/30   Skills  20/25   MCP  15/15
Plugins  10/10   Settings  5/10   Freshness  7/10

Always-loaded context: about 6,400 tokens

HIGH  INS-02  CLAUDE.md is about 5,800 tokens (limit 5,000)
      Fix: move rarely needed sections into skill files.
MED   INS-03  3 rules repeat between global and project CLAUDE.md
      Fix: keep each rule in one place.
```

Show the top findings first. Print a final line with counts and where files were written.

### 12.2 Badge

- Text: label `setup doctor`, message `<score> <Band>` (for example `79 Good`).
- Colors: Excellent `brightgreen`, Good `yellowgreen`, Needs work `orange`, Poor `red`.
- Printed snippet (static): `![Setup Doctor score](https://img.shields.io/badge/setup%20doctor-79%20Good-yellowgreen)`. The tool does not fetch this URL; the viewer's browser does.
- Endpoint file: `{"schemaVersion":1,"label":"setup doctor","message":"79 Good","color":"yellowgreen"}`.
- Endpoint usage: the user's own CI publishes the JSON to a public URL (see `docs/examples/badge-workflow.yml`) and the README uses `https://img.shields.io/endpoint?url=<encoded public URL of the JSON>`. Print these instructions with `--endpoint`.
- If nothing can be scored, produce no badge and say why.

### 12.3 Card content

Period label, four headline numbers (sessions, active days, total tokens, estimated cost), busiest hour, longest streak, persona label with its line, and a 30-cell activity strip in the `technical` and `mix` themes. Every card carries the tool name and the command `npx setup-doctor wrapped`. The card includes an SVG title and description for accessibility. Cost is marked with an asterisk and the footnote "API-equivalent estimate, not your bill".

## 13. Themes

Three themes: `playful` (default for the HTML report and badge SVG), `technical` (default for the Wrapped card), `mix`. One shared layout per output; each theme is a token set. Full tokens, layouts and font handling are in `themes.md`. Apply themes to the HTML report, the Wrapped card and the badge SVG. The terminal report and JSON are not themed. The chosen theme is recorded in the JSON output.

## 14. Fix mode (stretch goal, Phase 8)

Build this last. Ship in v1 only if Phases 1 to 7 are done and `npm run check` passes.

- `setup-doctor doctor --fix` proposes changes for findings that have a safe, mechanical fix, shows a unified diff per file, and asks for confirmation per file. In non-interactive shells it refuses unless `--yes` is given.
- `--fix --dry-run` shows the diffs and changes nothing.
- The initial safe set: INS-03 exact duplicate lines within one file, and MCP-02 identical duplicate server entries within one file. More rules join only after they prove safe.
- Never auto-fix findings marked `possible`. Never touch files outside the checked scope. Global configuration is edited only with an explicit `--scope global`.
- Before writing, copy every file to be changed into `.setupdoctor-backup/<timestamp>/` (preserving relative paths) and print that path.
- Refuse to edit a file that may have uncommitted git changes unless `--allow-dirty` is given. The tool never runs git. Rule: if a `.git` folder exists in the project root, treat every file inside the repository as possibly dirty, print a warning, and require `--allow-dirty`. Record this choice in `docs/notes.md`.
- After applying, recompute and print the score before and after and list every change made.
- Update PR-2 (below): writes to agent configuration happen only in fix mode.

## 15. Privacy and security requirements

| ID | Requirement |
| --- | --- |
| PR-1 | No network calls at runtime: no telemetry, no update check, no remote fonts or scripts in any output |
| PR-2 | Read-only on agent configuration and logs; writes go only to the output path the user chose or the current folder, with one exception: fix mode, which previews a diff, asks for confirmation and saves a backup first |
| PR-3 | Existing output files are never overwritten without confirmation or `--yes` |
| PR-4 | The log parser keeps only metadata (timestamps, model, token counts, tool names) and drops message text as each line is read |
| PR-5 | Secret-like strings found in files are reported by rule and location only; the value is always shown as `[REDACTED]` in every output |
| PR-6 | Badge and card contain aggregate numbers only: no paths, usernames, repo names or prompt text; project names appear only if the user opts in |
| PR-7 | The HTML report escapes all file-derived text and sets a Content-Security-Policy that blocks network access |
| PR-8 | Local reports carry a footer reminding the user they may contain file paths before sharing |
| PR-9 | No install scripts in the npm package; 0 to 3 runtime dependencies |
| PR-10 | Releases are published from GitHub Actions with npm provenance; two-factor authentication on the publishing account |
| PR-11 | An automated check fails the build if the code opens a network connection (`scripts/check-no-network.mjs`) |

Threat notes: files the tool reads may be hostile (a cloned repo can contain a malicious CLAUDE.md). Treat all content as data. Never execute anything found in files. Check MCP commands for existence only. Use safe path handling: resolve paths and reject any read outside the project root or the known global folders.

## 16. Non-functional requirements (targets)

| Area | Requirement | Target |
| --- | --- | --- |
| Performance | Doctor on a setup with 500 files | Under 5 seconds |
| Performance | Wrapped over 1 GB of logs (streamed) | Under 60 seconds and under 200 MB memory |
| Compatibility | Node | 20 and later |
| Compatibility | OS | macOS, Windows, Linux, including path and line-ending differences |
| Size | Installed package including subsetted fonts | Under 1 MB |
| Determinism | Same input, same rule version | Identical score and findings |
| Accessibility | HTML report and card | WCAG AA contrast, keyboard navigation, SVG title and description, no meaning carried by color alone |
| Terminal | Behavior | `NO_COLOR` respected, plain output when not a TTY |
| Maintainability | Rules | One module per rule; adding a rule touches one file plus the registry |
| Stability | JSON output | `schemaVersion` present; breaking changes only in major versions |
| Language | Interface | English only |

## 17. Error handling and edge cases

| Situation | Behavior |
| --- | --- |
| No agent configuration found | Print "Nothing to check" and how to use `--agent` or a path; exit 0 |
| File unreadable (permissions) | Skip, list under "Skipped files", continue |
| Instruction file over 10 MB | Skip with a warning |
| Malformed skill frontmatter or MCP JSON | Report as a finding (SKL-01, MCP-01), do not fail |
| Session log format not recognized | Skip that file, print "parsed X of Y session files"; exit 3 only if nothing could be parsed |
| No sessions in the chosen period | Card and report say "No sessions in this period" and suggest a wider `--period` |
| Model missing from the price table | Show tokens, cost "n/a", add a footnote |
| Symlink loops, very deep folders | Detect loops; limit depth to 5; warn when the limit is hit |
| Monorepo with several instruction files | Check each; report the file path |
| Output file already exists | Ask before overwriting; in `--ci` or a non-interactive shell require `--yes` |
| All categories non-applicable | "Not enough to score"; no badge |
| Windows paths and line endings | Normalize internally (treat CRLF as LF); report paths in native form |
| Heuristic finding uncertain | Label "possible"; its total deduction is capped at 50 percent of the category weight |
| Same rule fires many times | Group by rule and file; terminal shows first 3; HTML and JSON list all |
| Unknown flag, bad period, bad theme | Exit 2 with a clear message and valid values |
| `@resvg/resvg-js` missing when PNG requested | Write SVG, print a one-line hint that PNG needs the optional package; exit 0 |
| Font file missing or corrupt | Fall back to the system font stack in `themes.md`; do not fail |

## 18. Build phases and acceptance criteria

Work in order. Each phase ends with `npm run check` passing and a commit. Add tests as you go.

### Phase 0: Scaffold (done)

Package, build, CI, plugin manifests, skills, docs. Acceptance: `npm install`, `npm run check` and `npm run build` pass; `node dist/bin.js --version` prints the version.

### Phase 1: Core and Claude Code adapter

Build `types.ts`, `defaults.ts`, `config.ts`, `runner.ts`, `text.ts`, `tokens.ts`, `suppress.ts`, the adapter registry, `frontmatter.ts`, and the Claude Code adapter for instructions, skills (including subagents, section 8.1), MCP, plugins and settings (sessions come in Phase 5). Implement `detect()`, discovery limits, skip handling, path safety, and `@import` resolution for CLAUDE.md (section 8.1).
Acceptance: fixtures in `test/fixtures/` (at least: empty project, typical project, monorepo, broken files, a CLAUDE.md using `@import`, a project with a subagent file) load into the normalized model; unreadable and oversized files land in `skipped`; running `setup-doctor doctor --format json` prints a JSON report skeleton with no findings; `estTokens` on the import fixture reflects the spliced content.

### Phase 2: Instruction and skill rules

Implement INS-01 to INS-08 and SKL-01 to SKL-05 exactly as in `rules.md`; these run against both skill and subagent items (section 8.1) without modification. Implement `rules` and `explain` commands.
Acceptance: each rule has one triggering and one non-triggering test built from the examples in `rules.md`; `setup-doctor rules` lists them; `explain INS-02` prints the rule text.

### Phase 3: Remaining rules and scoring

Implement MCP-01 to MCP-04, PLG-01 to PLG-03, SET-01, SET-02, FRS-01, FRS-02, plus SKL-06 and MCP-05 (they need sessions and stay inactive until Phase 5 supplies records). Implement `scoring.ts` exactly as in section 10.4 and the terminal report.
Acceptance: scoring unit tests cover normalization, the critical cap, the possible-finding cap and all four bands; the terminal report matches section 12.1; `--ci --fail-under` works with exit codes.

### Phase 4: Reports, themes, badge

Implement the HTML report, JSON report, the three themes, font embedding, static and endpoint badges, `--theme`, `--min-severity`, `--out`, `--yes`.
Acceptance: the HTML report renders in all three themes with no network requests (test with a Content-Security-Policy check and a scan for `http` URLs other than shields.io text in the printed snippet); secrets appear only as `[REDACTED]`; the badge files match section 12.2; snapshot tests for HTML and SVG output.

### Phase 5: Wrapped for Claude Code

Implement `parse-claude.ts`, deduplication, metrics, persona, price table, the card in all three themes and both sizes, PNG through the optional package, `--period`, `--tz`, `--anonymize`, `--no-cost`, `--show-projects`. Activate SKL-06 and MCP-05.
Acceptance: fixtures with sample JSONL logs produce the expected metrics (write the expected values by hand); persona rules tested at their boundaries; a 1 GB synthetic log streams within the memory target; the card contains no paths or project names by default; unknown model gives "n/a" cost.

### Phase 6: Codex and Cursor adapters

Implement instruction, MCP and config discovery for both. Verify whether usable local usage data exists for Wrapped; log the findings in `docs/notes.md`. Ship Wrapped for them only if a source is verified, labeled experimental.
Acceptance: Doctor runs on Codex-only and Cursor-only fixtures; rules that do not apply are skipped and do not affect the score.

### Phase 7: Plugin, docs and release

Finalize `skills/`, marketplace file, README with demo GIF placeholder and privacy statement, `docs/examples`, CHANGELOG, release workflow. Run `claude plugin validate` if available; otherwise verify the manifest structure by hand.
Acceptance: `npm pack --dry-run` lists only intended files and stays under 1 MB; version sync passes; tag `v0.1.0` would publish with provenance.

### Phase 8: Fix mode (stretch)

Implement section 14.
Acceptance: dry run changes nothing; a real run creates a backup and fixes only the safe set; a dirty file is refused without `--allow-dirty`.

## 19. Release and distribution

- Semantic versioning. Next release: `0.1.0`. The rule set has its own version, `rulesVersion` (start at `1.0.0`), printed in every report; bump it when rules are added or changed; list rule changes in `CHANGELOG.md`.
- Release: bump versions in `package.json`, `src/version.ts`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` together (`npm run check:version` verifies), update `CHANGELOG.md`, tag `vX.Y.Z`, push the tag. GitHub Actions publishes to npm with provenance.
- The repository must stay public. Custom plugin marketplaces reportedly do not auto-update in Cowork and private repositories fail marketplace sync; note this in the README.
- After the first release, submit the plugin to the Anthropic community marketplace.

## 20. Out of scope for v1

- Non-developer Wrapped based on a chat data export
- Any hosted backend, accounts, sync, leaderboards, telemetry
- Analysis that calls an LLM or any network service
- Team dashboards or roll-ups across machines
- Measuring MCP tool definition tokens (needs a live connection)
- Automatic file changes other than fix mode
- Languages other than English

## 21. Definition of done (launch criteria)

- [x] `npm run check` and `npm run build` pass on macOS, Windows and Linux (CI matrix green)
- [x] All 26 rules implemented with ID, explanation and fix text, each with triggering and non-triggering tests
- [x] Score is identical across two runs on the same input (the config-based audit is fully deterministic; SKL-06/MCP-05 are heuristic, `possible`-labeled and inherently time-windowed by design, per section 11.5's "last 30 days")
- [x] Privacy guard passes in CI; no network access verified
- [x] All three themes render the HTML report and the card correctly
- [x] Badge (static and endpoint) works and matches section 12.2
- [x] Wrapped works for Claude Code with the metrics in section 11.3
- [x] README has the install line, a demo GIF placeholder, the privacy statement and a sample badge (the GIF itself still needs to be recorded by hand and swapped in)
- [ ] npm package published with provenance; plugin marketplace file validated (marketplace file validates clean via `claude plugin validate .`; publishing is a deliberate, separate step, not done as part of the build)
- [x] Codex and Cursor status documented honestly (Doctor: instructions + MCP rules only; Wrapped: not supported, with the real-install findings behind that in docs/notes.md)
