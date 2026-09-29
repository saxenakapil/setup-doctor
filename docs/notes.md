# Build notes

Log assumptions, deviations and open items here while building. Keep entries short and dated.

## Assumptions

- (none yet)

## Open items

- Codex and Cursor local usage data for Wrapped: verify in Phase 6. Until verified, Wrapped for those agents is experimental.
- Claude Code session log field names: verify against real logs in Phase 5 (see docs/scope.md section 11).
- Retired model list and price table: verify against Anthropic documentation at build time (see docs/scope.md sections 10 and 11).
- `@import` directive syntax in CLAUDE.md: verify the exact matching rule (line-start `@path`, inline references, or both) against real Claude Code behavior during Phase 1, and record any deviation from docs/scope.md section 8.1 here.

## Decisions made during the build

- 2026-09-29: subagent files (`~/.claude/agents/*.md`, `./.claude/agents/*.md`) are modeled as `Skill` items with `kind: 'agent'` rather than a new category, so SKL-01 to SKL-06 cover them without new rule IDs. See docs/scope.md section 8.1 and 9.
- 2026-09-29: CLAUDE.md `@import` resolution added to Phase 1 scope (docs/scope.md section 8.1) because leaving it out would make INS-02 and INS-06 silently wrong for any project using imports, not just an omitted feature.
- 2026-09-29: Phase 1 implemented. `@import` matching is line-exact (`^@\S+$`, the whole trimmed line is just `@path`), resolved depth-first up to the depth-5 limit shared with nested CLAUDE.md discovery, with cycle detection via a per-branch visited-path set (a cycle leaves the `@import` line as literal text plus a warning, never throws or hangs).
- 2026-09-29: `main()` in src/cli.ts takes an internal-only third parameter (`homeDirOverride`) so tests can point discovery at a fixture home directory instead of the real `~/.claude`. Not part of the documented CLI surface.
- 2026-09-29: `--agent all` is currently treated as an alias for auto-detect (run whichever of the known agents are detected), same as the default. Revisit once Codex and Cursor adapters exist in Phase 6, since scope.md's flag table lists `all` and the default (auto-detect) as visually distinct values without spelling out a behavioral difference.

- 2026-09-29: Phase 2 implemented. INS-06 and SKL-05 both need to know whether a referenced file exists on disk, which conflicts with "rules are pure functions of the model, no FS access inside rules" (CLAUDE.md working style) since scope.md section 9's `RelativeRef` type has no existence flag. Resolved by having the adapter (which already does FS reads) compute existence: `RelativeRef` gained `exists: boolean`, and `InstructionFile` gained `staleReferences: StaleReference[]` (`{ target, line, kind: 'path' | 'script', exists }`), computed in `src/adapters/claude-code.ts`. Rules stay pure; only the adapter touches the filesystem. `docs/scope.md` section 9 updated to match.
- 2026-09-29: INS-07's "build manifest present" check needs project-root file listing that isn't agent-specific (Makefile, Cargo.toml, etc. aren't a Claude Code concept). Computed once in `runner.buildModel` as `NormalizedModel.buildManifests`, not duplicated per adapter.
- 2026-09-29: The `Rule` interface (docs/rules.md) is extended with `severityLabel`, `why` and `fix` static fields beyond what rules.md lists, so `setup-doctor rules` and `explain <ID>` have text to print without constructing a dummy Finding. `run()` still returns the authoritative per-finding severity/why/fix (INS-02 varies medium/high by threshold).
- 2026-09-29: INS-03 and INS-04 findings can span two files (a duplicate or contradiction pair), but `Finding` only has one `file`/`line`. Both rules attach the first (sorted) file/line and put both locations in the message text; not a loss of information, just a representational choice.
- 2026-09-29: `doctor` now runs all Phase 1/2 rules and returns real `findings`/`suppressed` in the JSON output (score stays `null` until Phase 3's scoring.ts exists). This was not explicitly required by Phase 2's acceptance criteria but was a small increment once the rules existed, and made the JSON output meaningfully testable end to end.

- 2026-09-29: Phase 3 implemented (MCP-01..04, PLG-01..03, SET-01/02, FRS-01/02, SKL-06, MCP-05, plus scoring.ts and the terminal report). Same "adapter resolves, rule stays pure" pattern extended to three more places, resolving the open item from Phase 1:
  - `McpServer.commandFound?: boolean` (MCP-01b): computed by the adapter via `src/adapters/path-check.ts`'s `isCommandOnPath`, which is fully injectable (PATH string, delimiter, PATHEXT, fileExists function) and unit-tested directly without touching the real machine's PATH. The adapter itself still reads real `process.env.PATH`/`PATHEXT` at call time, same as any FS/env access an adapter is allowed to do.
  - `NormalizedModel.mcpConfigErrors: ConfigError[]` (MCP-01a): `AdapterResult<T>` gained an optional `configErrors` field so `readMcp` can report "file exists but failed to parse" as structured data instead of only a free-text warning string. Warnings are still also pushed for human-readable output.
  - `HookDef.scriptCheck?: HookScriptCheck` (SET-02): adapter resolves `$CLAUDE_PROJECT_DIR`, skips hooks with `${...}` variables (unresolvable here) or a non-path first token (already covers "invokes an interpreter"), and reports `exists`/`executable` (always `executable: true` on Windows, which has no exec bit).
- 2026-09-29: MCP-01's trigger fixture uses the literal command name `not-a-real-binary-xyz-123` (matching rules.md's own example) rather than an absolute nonexistent path, relying on it never colliding with a real PATH entry on any CI runner. The clean fixture uses `npx`, guaranteed on PATH in this repo's own CI (Node/npm setup). Both are real PATH lookups, not synthetic ones, since `isCommandOnPath` itself is separately unit-tested with injected PATH/fileExists for full determinism.
- 2026-09-29: MCP-02(a) ("same name in more than one file") is implemented as "flag whenever a server name has more than one distinct source file," not the more granular "different definitions OR same definition across global+project" split rules.md's prose describes. In practice these collapse to the same outcome for every realistic case (a same-scope duplicate isn't representable in our model since JSON object keys are unique per file), so this is a simplification, not a behavior gap.
- 2026-09-29: Category applicability for `settings` (needed by `scoring.ts`) is approximated as "at least one hook or permission rule exists," not "at least one settings file, hook or permission rule" as scope.md 10.3 states, because the model doesn't separately track "a settings.json existed but was empty." An empty settings.json is indistinguishable from no settings.json under this proxy. Low impact: an empty settings file has nothing to score anyway.
- 2026-09-29: `RuleContext` gained an optional `now?: string` (ISO) field so SKL-06 and MCP-05's "last 30 days" windows never call `Date.now()` internally, keeping them reproducible in tests. The CLI/runner will default it to the real current time once Phase 5 wires sessions in; until then both rules always see `sessions` as `undefined`/empty and return `[]`, exactly as scope.md's Phase 3 note ("stay inactive until Phase 5 supplies records") describes.
- 2026-09-29: The terminal report's per-category display score is `round(fraction * weight)`, shown as `n/a` for non-applicable categories rather than a misleading `0/10`. Grouping caps same-rule-same-file findings at 3 lines with a "... and N more like this" summary, per docs/scope.md section 10.6.

## Backlog / v1.1+ ideas

Not in v1 scope. Recorded so Phase 1 to 8 decisions do not foreclose them.

- **Score history and regression detection.** A local, opt-in, no-network `.setupdoctor-history.jsonl` appended on `--ci` runs, so a future `--compare` flag or CI action can flag "score dropped since last run." Low retrofit cost since JSON output already carries `schemaVersion`; no architecture change needed now.
- **More agent adapters.** GitHub Copilot instructions (`.github/copilot-instructions.md`), Windsurf, Cline, Continue.dev. The `Adapter` interface is already generic; adding one is a new file, not a core change.
- **Deeper settings and hooks coverage.** Beyond SET-01/SET-02: hooks that shell out to network tools, deny-lists so broad they block legitimate work, hook commands that could leak env vars into logs. Each is a new rule (spec, fixtures, tests), so treat as incremental v1.1 additions, not a v1 gap.
- **Fix mode expansion beyond the Phase 8 safe set.** Candidates for after INS-03 and MCP-02: FRS-02 (swap retired model name), SKL-02 (rewrap an out-of-range description), MCP-04 (disable least-used server). Only add after each proves safe and mechanical, per section 14.
- **Wrapped trend and comparison view.** "This week vs last week" on the card or terminal report. Secondary to Doctor's core value; also, subagent invocations will already surface in the existing "top tools" metric once section 8.1's `kind: 'agent'` modeling lands, so this is lower urgency than first thought.
