# Fix mode

`doctor --fix` applies safe, mechanical fixes to your configuration. It is the only `setup-doctor` command that edits existing files. It always shows a diff first, makes a backup, and requires confirmation before writing.

## Which findings can be fixed

Only findings with an unambiguous, mechanical fix qualify. Currently there are two:

| Rule | Fix |
| --- | --- |
| `INS-03` | Removes an exact duplicate line repeated within one instruction file. |
| `SET-02` | Removes a hook that points to a missing or non-executable script, from the shared `.claude/settings.json` or `settings.local.json`. |

Every other finding requires a decision a tool cannot make for you. Examples include which MCP command should replace a broken one, whether a permission rule is intentional, and which model should replace a retired one. Those findings include a fix description, but `--fix` does not apply them.

## Preview changes

`--dry-run` shows every change and writes nothing:

```bash
npx setup-doctor doctor --fix --dry-run
```

For a `CLAUDE.md` that contains a duplicated line:

```
1 safe fix available:

INS-03  2 rules repeat within CLAUDE.md
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,4 +1,3 @@
 Always run the tests before committing.
 Use 2 space indentation.
-Always run the tests before committing.
 

Dry run: no files changed.
```

## Apply changes

Applying requires `--yes`. Without it, the command refuses to write:

```bash
npx setup-doctor doctor --fix --yes
```

```
1 safe fix available:

INS-03  2 rules repeat within CLAUDE.md
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,4 +1,3 @@
 Always run the tests before committing.
 Use 2 space indentation.
-Always run the tests before committing.
 

Backed up 1 file(s) to .setupdoctor-backup/2026-10-04T03-08-25-152Z

Score before: 95   Score after: 100
Changes made:
  INS-03  CLAUDE.md: 2 rules repeat within CLAUDE.md
```

Each run follows the same sequence:

1. **Backup.** Every file a fix will change is copied to `.setupdoctor-backup/<timestamp>/` before anything is written. The backup directory is excluded from discovery, so a backup can never produce a finding.
2. **Diff.** The change is shown again, so you have a record.
3. **Score.** The score before and after is reported.

## Uncommitted changes

Project files can only be changed when the project does not appear to have uncommitted git changes. The check is conservative: it looks for a `.git` directory and does not run `git`.

If the check fails, the fix is skipped and reported:

```
No safe fixes available.

Findings that could not be auto-fixed:
  INS-03 CLAUDE.md: project may have uncommitted git changes; pass --allow-dirty
```

Pass `--allow-dirty` to proceed anyway, after reviewing the diff:

```bash
npx setup-doctor doctor --fix --yes --allow-dirty
```

Files outside a project, such as your user-level configuration, are not subject to this check.

## Recovering from a fix

Each backup keeps the file's relative path under a folder named for its scope, for example `.setupdoctor-backup/<timestamp>/project/CLAUDE.md`. To restore, copy the file back to its original location.

## How SET-02 is fixed

Unlike `INS-03`, which removes a line of text, `SET-02` edits the JSON structurally. The file is parsed, the broken hook is removed, and the file is written back. Other hooks in the same file are unchanged, and the file stays valid JSON.

If the file's formatting cannot be reproduced exactly after re-serializing, for example because of unusual indentation, the fix is skipped. The tool does not reformat parts of a file you did not ask it to change.

## Scope

`--fix` respects the `--scope` and `--agent` you select. Fixes for disabled rules are not offered; see [configuration](config.md).
