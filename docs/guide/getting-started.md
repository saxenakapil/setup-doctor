# Getting started

This guide explains your first run of `setup-doctor` and how to read its output.

## Run it

From the root of a project:

```bash
npx setup-doctor
```

No arguments are needed. The command detects which agents you use, reads project files such as `CLAUDE.md` and `.mcp.json`, and reads your user-level configuration such as `~/.claude/settings.json`.

## Read the output

```
Setup Doctor  score 85/100  (Good)   rules v1.2.0

Instruction files  29/30   Skills  n/a   MCP  n/a   Plugins  n/a   Settings  5/10   Freshness  n/a

Always-loaded context: about 0 tokens

HIGH  SET-02  Hook PreToolUse in .claude/settings.json points to scripts/missing.sh which is missing or not executable
      Fix: Correct the path, make the script executable, or remove the hook.
LOW   INS-01  No instruction file found for claude
      Fix: Create CLAUDE.md (or the agent's equivalent) with build and test commands, code style rules and a short project layout.

2 findings
```

Absolute paths in finding messages are shortened in this example.

### The score

- **Score** is 0 to 100. The band is Excellent (90 to 100), Good (75 to 89), Needs work (50 to 74), or Poor (0 to 49).
- **Category breakdown** shows where points were lost. `n/a` means the category does not apply to your setup. It is excluded from the score and is not counted as a failure.
- **Always-loaded context** estimates the tokens your instruction files and skill descriptions add to every turn.
- **Critical findings cap the score at 74**, whatever the other categories show.

### A finding

```
HIGH  SET-02  Hook PreToolUse in .claude/settings.json points to scripts/missing.sh which is missing or not executable
      Fix: Correct the path, make the script executable, or remove the hook.
```

Each finding has:

- a severity: `CRIT`, `HIGH`, `MED` or `LOW`
- a rule ID, which you can look up with `setup-doctor explain <RULE_ID>`
- a message that names the file and the problem
- a concrete fix

A `(possible)` suffix marks a heuristic. Possible findings count for half the points of a certain finding of the same severity.

## Next steps

1. Fix `CRIT` and `HIGH` findings first.
2. Run `setup-doctor explain <RULE_ID>` for the reasoning behind any finding.
3. Run `setup-doctor doctor --fix --dry-run` to preview any automatic fixes. See [fix mode](fix-mode.md).
4. To suppress a rule for one project, see [configuration](config.md).
5. To track the score over time or gate pull requests, see [CI integration](ci-integration.md).
6. To see every option, see [doctor](doctor.md).
