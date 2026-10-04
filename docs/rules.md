# Setup Doctor: Rules (v1, rulesVersion 1.0.0)

Every Doctor v1 rule, specified for implementation and tests. This file covers the 26 rules in the v1 scope; the current release has 30. Rules added after v1 (SET-03 to SET-05, MCP-06) are specified in `notes.md`. `scope.md` covers scoring, categories and the data model; this file covers what each rule checks. If the two conflict, this file wins for rule behavior.

## Conventions

- Rules are pure functions of the normalized model (`scope.md` section 9). No file system access inside rules; adapters supply everything a rule needs.
- One file per rule in `src/rules/`, named by lowercase ID (`ins-02.ts`), registered in `src/rules/index.ts`.
- Rule interface:

```ts
interface Rule {
  id: string;
  category: Category;
  title: string;
  agents: Agent[];                      // agents the rule applies to
  heuristic: boolean;                   // true: findings are labeled "possible"
  needsSessions?: boolean;              // true: runs only when session logs were parsed
  fixable?: boolean;                    // true: fix mode may handle it (scope.md section 14)
  run(ctx: RuleContext): Finding[];
}
```

- Severity points: critical 10, high 5, medium 2, low 1.
- Thresholds marked (default) are starting values. They live in `src/core/defaults.ts` and can be overridden in `.setupdoctorrc`.
- Normalization used by several rules (`src/core/text.ts`): `normalizeLine(s)` lowercases, trims, strips list markers (`-`, `*`, `+`, `1.`), strips surrounding markdown emphasis, and collapses whitespace. Lines inside fenced code blocks and headings are ignored by text rules unless a rule says otherwise. Treat CRLF as LF.
- Word sets: split on non-letters and digits, lowercase, drop stopwords (`a an the and or of to in on for with is are be it this that as at by from`) and tokens shorter than 2 characters.
- Similarity functions: `jaccard(A, B) = |A ∩ B| / |A ∪ B|` on word sets; `dice(A, B) = 2|A ∩ B| / (|A| + |B|)` on word bigrams of the normalized line.
- Secret detection (`src/core/text.ts`, shared by INS-08 and MCP-03): see INS-08.
- Finding messages must never contain a secret value. Use `[REDACTED]`.
- Findings for the same rule and file are grouped in terminal output (first 3 shown).
- Every rule needs one test that triggers it and one that does not, using the examples below. Put fixtures in `test/fixtures/<rule-id>-trigger/` and `<rule-id>-clean/`.

## Category: Instruction files (weight 30)

### INS-01 Instruction file present

- Severity: low. Agents: claude, codex, cursor. Heuristic: no.
- Checks: for each detected agent, at least one instruction file exists at global or project level. Claude: `CLAUDE.md` (any location in scope.md 8.1). Codex: `AGENTS.md`. Cursor: `.cursorrules` or `.cursor/rules/*`.
- Message: `No instruction file found for <agent>`
- Why: an instruction file is the cheapest way to tell the agent your build commands, style and project layout.
- Fix: `Create CLAUDE.md (or the agent's equivalent) with build and test commands, code style rules and a short project layout.`
- Triggers: a detected Claude Code setup with no CLAUDE.md anywhere. Does not trigger: a project with a `CLAUDE.md`, or only a global `~/.claude/CLAUDE.md`.

### INS-02 Instruction file too large

- Severity: medium when `estTokens >= warnTokens`, high when `estTokens >= highTokens`. Agents: all. Heuristic: no.
- Parameters (default): `warnTokens = 2000`, `highTokens = 5000`. Token estimate: `ceil(chars / 4)`.
- Checks: per instruction file. One finding per file over the warn limit.
- Message: `<file> is about <N> tokens (limit <warnTokens or highTokens>)`. Set `tokensSaved = N - warnTokens`.
- Why: instruction files load on every turn, so size is a recurring cost and dilutes the important rules.
- Fix: `Move rarely needed sections into skill files or docs the agent reads on demand. Keep the always-loaded file short.`
- Triggers: a CLAUDE.md of 24,000 characters (about 6,000 tokens) gives high. Does not trigger: a 4,000 character file.

### INS-03 Duplicate rules

- Severity: medium. Agents: all. Heuristic: no. Fixable: exact duplicate lines within one file only.
- Checks: for each agent, collect normalized lines from all its instruction files. Ignore headings, code blocks, and lines shorter than 20 characters after normalization. Two lines are duplicates when they are exactly equal after normalization, or when `dice >= 0.9` (default). Group duplicates into clusters. One finding per cluster.
- Message: `<N> rules repeat between <fileA> and <fileB>` (or `within <file>`). Report the first line number in each file.
- Why: repeated rules waste tokens and drift apart when only one copy is edited.
- Fix: `Keep each rule in one place and delete the other copies.`
- Triggers: the line `Always run the tests before committing.` present in both `~/.claude/CLAUDE.md` and `./CLAUDE.md`. Does not trigger: two files with different rules; a repeated heading.
- Notes: cross-file duplicates are suggestions only. Fix mode removes only exact duplicates inside the same file.

### INS-04 Possible contradictions

- Severity: medium. Agents: all. Heuristic: yes (findings say "possible"). Fixable: no.
- Checks: extract directive lines: normalized lines containing a positive cue (`always`, `must`, `should`, `prefer`, `use`) or a negative cue (`never`, `do not`, `don't`, `avoid`, `must not`). For each pair (one positive, one negative) across all files of the same agent, compute `jaccard` of their content word sets after removing the cue words. Flag the pair when `jaccard >= 0.6` (default) and each set has at least 2 words.
- Message: `Possible contradiction between <fileA>:<line> and <fileB>:<line>`.
- Why: conflicting rules make the agent's behavior unpredictable.
- Fix: `Decide which rule wins and remove or reword the other. Say which situation each rule applies to.`
- Triggers: `Always use semicolons in TypeScript.` and `Never use semicolons in TypeScript.` Does not trigger: `Always run tests before committing.` and `Never commit secrets.`
- Notes: never let this rule alone push a category below the 50 percent cap (scope.md 10.4).

### INS-05 Vague rules

- Severity: low. Agents: all. Heuristic: no.
- Checks: lines of 12 words or fewer whose normalized text equals or starts with an entry in `src/data/vague-rules.ts`. Starting list: `write clean code`, `write good code`, `follow best practices`, `use best practices`, `be careful`, `keep code clean`, `make it maintainable`, `write high quality code`, `write readable code`, `follow good practices`, `be thorough`, `do a good job`.
- Message: `<N> vague rules in <file> (for example line <first>)`. One finding per file.
- Why: rules the agent cannot act on add tokens without changing behavior.
- Fix: `Replace vague rules with specific ones, for example "Use 2 space indentation and single quotes".`
- Triggers: a line `Write clean code.` Does not trigger: `Write clean code by keeping functions under 40 lines.`
- Implementation note: match only when the whole normalized line, with trailing punctuation removed, equals an entry exactly.

### INS-06 Stale references

- Severity: medium. Agents: all. Heuristic: no.
- Checks: only for project instruction files. Extract (a) inline-code tokens that look like relative paths (contain `/` or end in a known extension such as `.ts .tsx .js .jsx .mjs .json .md .py .go .rs .java .yml .yaml .toml .sh`; no spaces; not a URL; not starting with `~`, `/`, or a drive letter; skip tokens containing `*`, `{`, `<`), and (b) `npm run <script>`, `pnpm <script>`, `yarn <script>` commands. Resolve paths relative to the project root and report those that do not exist. For (b), report scripts missing from `package.json` `scripts` when a `package.json` exists.
- Message: `<file> mentions <token> which does not exist`. Group per file; cap at 10 findings per file.
- Why: stale references send the agent to files and commands that no longer exist.
- Fix: `Update the reference to the current path or command, or remove it.`
- Triggers: `` `src/legacy/handler.ts` `` where the file is missing. Does not trigger: a path that exists; a URL; a glob.

### INS-07 No build or test command documented

- Severity: low. Agents: all. Heuristic: no.
- Checks: only when the project has a build manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Makefile`, `*.csproj`) and a project instruction file exists. Passes if any project instruction file matches any of: `npm|pnpm|yarn|bun (run )?(test|build|lint)`, `pytest`, `go test`, `cargo (test|build)`, `make (test|build)`, `mvn`, `gradle`, `dotnet (test|build)`, `run (the )?tests`, `build command`, `test command`. Otherwise one finding.
- Message: `No build or test command documented in <file>`
- Why: agents work better when they know how to build and verify their changes.
- Fix: `Add the commands to run the build and the tests, for example "npm test" and "npm run build".`
- Triggers: a Node project whose CLAUDE.md lists style rules but no commands. Does not trigger: a CLAUDE.md that says `Run npm test before committing.`

### INS-08 Secret-like string in an instruction file

- Severity: critical. Agents: all. Heuristic: no.
- Checks: scan every instruction file line (including code blocks) for these patterns, and report the file and line only:
  - `sk-ant-[A-Za-z0-9_-]{20,}`, `sk-[A-Za-z0-9_-]{20,}`
  - `ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{50,}`
  - `AKIA[0-9A-Z]{16}`
  - `xox[baprs]-[A-Za-z0-9-]{10,}`
  - `AIza[0-9A-Za-z_-]{35}`
  - `-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----`
  - assignments: `(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"]?([A-Za-z0-9_\-/+=]{16,})` where the value has Shannon entropy of at least 3.5 bits per character and does not look like a placeholder (contains `your`, `example`, `xxxx`, `changeme`, `<`, `>`, `${`, or is all one repeated character)
- Message: `Secret-like value in <file>:<line> ([REDACTED])`. Never include the matched text.
- Why: instruction files are often committed and are sent to the model provider on every turn.
- Fix: `Remove the value, rotate the credential, and read it from an environment variable instead.`
- Triggers: `API_KEY=` followed by a 32 character random string. Does not trigger: `API_KEY=your-api-key-here`; a 40 character hash inside a sentence about commits (no assignment cue).
- Notes: `src/core/text.ts` exports `findSecretLikeValues(line): { kind: string }[]` and never returns the value. MCP-03 reuses it.

## Category: Skills (weight 25)

### SKL-01 Invalid or missing frontmatter

- Severity: high. Agents: claude (skills folders). Heuristic: no.
- Checks: `SKILL.md` must start with a line `---`, have a closing `---`, and the frontmatter must contain non-empty `name` and `description`. Parse with the YAML subset in `src/adapters/frontmatter.ts`: `key: value` pairs, quoted strings (single or double), plain scalars, and block scalars `>` and `|` (folded and literal). Ignore other constructs. A parse failure or a missing required key is a finding.
- Message: `<file>: <reason>` where reason is one of `no frontmatter`, `frontmatter not closed`, `missing name`, `missing description`, `empty description`.
- Why: without a valid name and description the agent cannot decide when to use the skill.
- Fix: `Add frontmatter with a name and a description that says when to use the skill.`
- Triggers: a SKILL.md with no `---` block. Does not trigger: a file with `name: doctor` and a description.

### SKL-02 Description too short or too long

- Severity: medium. Agents: claude. Heuristic: no.
- Parameters (default): `minChars = 20`, `maxChars = 500`.
- Checks: description length (characters after trimming) below the minimum or above the maximum. Skip when SKL-01 already reports a missing description.
- Message: `Skill <name> has a description of <N> characters (<too short|too long>)`
- Why: the description decides triggering; too short is ambiguous and too long wastes tokens on every turn.
- Fix: `Write one or two sentences that say what the skill does and when to use it.`
- Triggers: `description: Helper.` Does not trigger: a 150 character description.

### SKL-03 Overlapping skills

- Severity: medium. Agents: claude. Heuristic: no.
- Checks: for every pair of skills of the same agent, compute `jaccard` of description word sets. Flag when `>= 0.6` (default) and both sets have at least 4 words. Also flag two skills with the same `name` in different files with similarity 1.0 unless one is project scope and one is global (project overrides global by design; do not flag that case).
- Message: `Skills <A> and <B> have overlapping descriptions`
- Why: overlapping triggers make the agent pick the wrong skill or load both.
- Fix: `Merge the skills or sharpen each description so they trigger on different requests.`
- Triggers: two skills whose descriptions differ by one word. Does not trigger: skills with different topics.

### SKL-04 Skill file too long

- Severity: low. Agents: claude. Heuristic: no.
- Parameters (default): `maxLines = 500`.
- Checks: `lineCount > maxLines`.
- Message: `<file> has <N> lines (limit <maxLines>)`
- Why: long skills load a lot of text each time they trigger.
- Fix: `Keep SKILL.md short and move detail into reference files that load only when needed.`
- Triggers: a 700 line SKILL.md. Does not trigger: a 120 line file.

### SKL-05 Broken links to bundled files

- Severity: medium. Agents: claude. Heuristic: no.
- Checks: for each relative reference in `relativeRefs` (Markdown links `[text](path)` and inline-code paths that contain `/` or a known extension; exclude URLs, `#anchors`, absolute paths, tokens with `*` or `<`), resolve relative to the skill folder and report those missing.
- Message: `<file>:<line> links to <target> which does not exist`
- Why: a skill that points to missing files fails when it triggers.
- Fix: `Add the missing file or correct the link.`
- Triggers: `[schema](references/schema.md)` with no such file. Does not trigger: an existing file; an https link.

### SKL-06 Skill not used recently

- Severity: low. Agents: claude. Heuristic: yes. Needs sessions.
- Checks: only when session logs were parsed and cover at least 14 days. A skill counts as used when any session record in the last 30 days has a tool call named `Skill` whose input names the skill, or a user record starts with `/<skill-name>`. (The parser records tool names only; extend `SessionRecord.tools` with the skill name for calls to the `Skill` tool. Verify the log shape in Phase 5.) Flag skills with no use in 30 days.
- Message: `Skill <name> was not used in the last 30 days (possible)`
- Why: unused skills still cost description tokens every turn.
- Fix: `Remove the skill or disable it if you no longer need it.`
- Triggers: fixture logs spanning 20 days with no use of skill `alpha`. Does not trigger: logs covering only 5 days; a skill used once.

## Category: MCP servers (weight 15)

### MCP-01 Config problem or command not found

- Severity: high. Agents: claude, codex, cursor. Heuristic: no.
- Checks: (a) an MCP configuration file that exists but is not valid JSON (or TOML for Codex); (b) a stdio server whose `command` is not found on `PATH` (check each PATH folder for the file; on Windows try `PATHEXT` extensions; never execute anything). Skip (b) for servers with a `url`, and for commands that are absolute paths that exist. Skip disabled servers.
- Message: `<file>: <parse error location>` or `MCP server <name> uses command <command> which was not found on PATH`
- Why: a broken server fails silently or slows startup.
- Fix: `Fix the config syntax, install the command, or remove the server entry.`
- Triggers: `{"command": "not-a-real-binary"}`. Does not trigger: `npx` when it is on PATH.
- Notes: the PATH check must be injectable (pass the PATH string and a file-exists function) so tests do not depend on the machine.

### MCP-02 Duplicate servers

- Severity: medium. Agents: claude, codex, cursor. Heuristic: no. Fixable: identical duplicate entries within one file.
- Checks: (a) the same server `name` defined in more than one file for the same agent with different definitions or the same definition in both global and project scope; (b) two servers under different names with the same signature (`command` plus `args`, or `url`).
- Message: `MCP server <name> is defined more than once (<fileA>, <fileB>)` or `Servers <A> and <B> run the same command`
- Why: duplicates load twice and double the tool definitions.
- Fix: `Keep one definition and delete the duplicates.`
- Triggers: `github` defined in `~/.claude.json` and `.mcp.json`. Does not trigger: two servers with different commands.

### MCP-03 Hardcoded secret in server environment

- Severity: critical. Agents: claude, codex, cursor. Heuristic: no.
- Checks: for each server `env` entry (and `headers` if present): flag when the key matches `/(key|token|secret|password|passwd|auth)/i` and the value is a literal that does not start with `$` or `${` and is at least 8 characters, or when `findSecretLikeValues(value)` returns a match. The adapter computes this and stores only the key names in `secretLikeEnvKeys`; values are never kept.
- Message: `MCP server <name> has a hardcoded secret in env <KEY> ([REDACTED])`
- Why: config files are often committed or synced; a leaked token gives access to the connected service.
- Fix: `Move the value to an environment variable and reference it, then rotate the credential.`
- Triggers: `"env": {"GITHUB_TOKEN": "ghp_..."}`. Does not trigger: `"GITHUB_TOKEN": "${GITHUB_TOKEN}"`.

### MCP-04 Many servers configured

- Severity: low. Agents: claude, codex, cursor. Heuristic: no.
- Parameters (default): `maxServers = 8`.
- Checks: count enabled servers per agent (union across scopes, deduplicated by name). Flag when the count exceeds the limit.
- Message: `<N> MCP servers configured for <agent> (limit <maxServers>)`
- Why: each server adds tool definitions to the context of every session.
- Fix: `Disable servers you do not use in this project.`
- Triggers: 10 enabled servers. Does not trigger: 4 servers.

### MCP-05 Server not used recently

- Severity: low. Agents: claude. Heuristic: yes. Needs sessions.
- Checks: only when session logs were parsed and cover at least 14 days. A server counts as used when any record in the last 30 days has a tool name starting with `mcp__<server-name>__`. Flag enabled servers with no use.
- Message: `MCP server <name> was not used in the last 30 days (possible)`
- Why: unused servers still add tool definitions.
- Fix: `Remove or disable the server if you no longer need it.`
- Triggers: fixture logs with no `mcp__linear__` calls in 30 days for server `linear`. Does not trigger: logs covering 5 days.

## Category: Plugins (weight 10)

### PLG-01 Invalid plugin manifest

- Severity: high. Agents: claude. Heuristic: no.
- Checks: each installed plugin folder has `.claude-plugin/plugin.json` that parses as JSON, has a `name`, and the name is lowercase kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`).
- Message: `Plugin <folder>: <reason>` with reason `manifest missing`, `invalid JSON`, `missing name`, or `name is not kebab-case`.
- Why: a plugin with a bad manifest may fail to load.
- Fix: `Fix plugin.json so it is valid JSON with a kebab-case name, or remove the plugin.`
- Triggers: a plugin folder with no manifest. Does not trigger: a valid manifest.

### PLG-02 Name collisions between plugins

- Severity: medium. Agents: claude. Heuristic: no.
- Checks: two or more enabled plugins that define a skill or command with the same short name.
- Message: `Plugins <A> and <B> both define <name>`
- Why: colliding names make it unclear which one runs.
- Fix: `Disable one plugin or rename one of the commands.`
- Triggers: two plugins each with a `review` skill. Does not trigger: distinct names.

### PLG-03 Plugin installed but disabled

- Severity: low. Agents: claude. Heuristic: no.
- Checks: plugins that are present on disk and marked disabled in settings (`enabledPlugins` entry set to false).
- Message: `Plugin <name> is installed but disabled`
- Why: unused plugins clutter the setup and may still cost disk and update effort.
- Fix: `Uninstall plugins you do not plan to use.`
- Triggers: `"enabledPlugins": {"foo@market": false}` with the plugin present. Does not trigger: enabled plugins.

## Category: Settings and hooks (weight 10)

### SET-01 Overly broad permission rule

- Severity: high. Agents: claude. Heuristic: no.
- Checks: allow rules that grant unrestricted or dangerous shell access: exactly `Bash`, `Bash(*)`, `Bash(:*)`, `*`; or an allow rule for `Bash(...)` whose pattern begins with `rm`, `sudo`, `chmod 777`, `curl`, `wget`, or contains `| sh` or `| bash`.
- Message: `Permission rule <rule> in <file> allows unrestricted or risky commands`
- Why: broad allow rules remove the safety prompt for actions that can delete files or run downloaded code.
- Fix: `Replace it with narrow rules such as Bash(npm test:*), and keep dangerous commands behind a prompt.`
- Triggers: `"allow": ["Bash(*)"]`. Does not trigger: `"allow": ["Bash(npm test:*)"]`.

### SET-02 Hook points to a missing script

- Severity: high. Agents: claude. Heuristic: no.
- Checks: for each hook command, take the first token. If it is a path (starts with `./`, `../`, `/`, `~/`, or contains a path separator), resolve it (replace `$CLAUDE_PROJECT_DIR` with the project root; skip commands that contain `${CLAUDE_PLUGIN_ROOT}` or other unresolvable variables) and flag when the file does not exist. On macOS and Linux also flag when the file exists but is not executable and the hook does not invoke an interpreter (`sh`, `bash`, `node`, `python`, and so on). Never run the command.
- Message: `Hook <event> in <file> points to <path> which is missing or not executable`
- Why: a broken hook silently fails or blocks actions.
- Fix: `Correct the path, make the script executable, or remove the hook.`
- Triggers: `"command": "./scripts/format.sh"` with no such file. Does not trigger: `"command": "npx prettier --write"`.

## Category: Freshness (weight 10)

### FRS-01 Hard-pinned versions in instructions

- Severity: low. Agents: all. Heuristic: no.
- Checks: instruction lines that name a tool and a version with at least major and minor, or a major of two digits or more: `(Node(\.js)?|Python|Java|Go|Rust|Ruby|PHP|Spring Boot|Django|Rails|React|Next\.js|Angular|Vue|TypeScript|Kubernetes|Terraform) v?\d+(\.\d+){1,2}` and `(Node|Java) \d{2}`. Ignore code blocks.
- Message: `<N> hard-pinned versions in <file> (for example "<the matched text>")`. One finding per file.
- Why: pinned versions go stale and then mislead the agent.
- Fix: `Point to the source of truth instead, such as the engines field in package.json or a .tool-versions file.`
- Triggers: `Use Spring Boot 3.4.3 and Node 20.` Does not trigger: `Use TypeScript.`

### FRS-02 Retired model names

- Severity: medium. Agents: all. Heuristic: no.
- Checks: instruction files and skill files that mention a model identifier in `src/data/retired-models.ts`. Starting list (verify against Anthropic's model deprecation documentation during Phase 3 and keep `asOf`): `claude-2`, `claude-instant`, `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-7-sonnet`. Match on word boundaries, case-insensitive.
- Message: `<file>:<line> mentions retired model <name>`
- Why: requests to retired models fail.
- Fix: `Replace it with a current model name from the provider's model list.`
- Triggers: a line `Use claude-3-opus for reviews.` Does not trigger: a file that names no models.
- Notes: the retired list is data, not logic. Update it each release and print its `asOf` date in `setup-doctor rules`.

## Summary table

| ID | Title | Category | Severity | Heuristic | Needs sessions | Fixable |
| --- | --- | --- | --- | --- | --- | --- |
| INS-01 | Instruction file present | instructions | low | no | no | no |
| INS-02 | Instruction file too large | instructions | medium / high | no | no | no |
| INS-03 | Duplicate rules | instructions | medium | no | no | exact, same file |
| INS-04 | Possible contradictions | instructions | medium | yes | no | no |
| INS-05 | Vague rules | instructions | low | no | no | no |
| INS-06 | Stale references | instructions | medium | no | no | no |
| INS-07 | No build or test command | instructions | low | no | no | no |
| INS-08 | Secret-like string | instructions | critical | no | no | no |
| SKL-01 | Invalid or missing frontmatter | skills | high | no | no | no |
| SKL-02 | Description length | skills | medium | no | no | no |
| SKL-03 | Overlapping skills | skills | medium | no | no | no |
| SKL-04 | Skill file too long | skills | low | no | no | no |
| SKL-05 | Broken links | skills | medium | no | no | no |
| SKL-06 | Skill not used recently | skills | low | yes | yes | no |
| MCP-01 | Config problem or command not found | mcp | high | no | no | no |
| MCP-02 | Duplicate servers | mcp | medium | no | no | identical, same file |
| MCP-03 | Hardcoded secret in env | mcp | critical | no | no | no |
| MCP-04 | Many servers | mcp | low | no | no | no |
| MCP-05 | Server not used recently | mcp | low | yes | yes | no |
| PLG-01 | Invalid plugin manifest | plugins | high | no | no | no |
| PLG-02 | Name collisions | plugins | medium | no | no | no |
| PLG-03 | Installed but disabled | plugins | low | no | no | no |
| SET-01 | Overly broad permission | settings | high | no | no | no |
| SET-02 | Hook points to missing script | settings | high | no | no | no |
| FRS-01 | Hard-pinned versions | freshness | low | no | no | no |
| FRS-02 | Retired model names | freshness | medium | no | no | no |
