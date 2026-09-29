# Fix mode

`setup-doctor` is read-only everywhere except `--fix`. Even then, it never edits a file without showing you the diff first, and never applies anything without your explicit confirmation.

## The safe set

Not every finding is fixable. Two rules currently qualify:

- **INS-03**: an exact duplicate line repeated within one instruction file.
- **SET-02**: a hook that points to a missing or non-executable script. It cannot run either way, so removing it changes no real behavior; only offered for the shared `.claude/settings.json`/`settings.local.json` shape, not Copilot CLI's own native `.github/hooks/*.json` format.

Everything else needs a human judgment call (what MCP command should this actually be? is this permission rule intentional? which current model should replace a retired one?), so `setup-doctor` will tell you what is wrong and how to fix it, but will not guess for you.

## Preview a fix: `--dry-run`

Starting from a `CLAUDE.md` with one duplicated line:

```
Always run the tests before committing.
Use 2 space indentation.
Always run the tests before committing.
```

```bash
$ npx setup-doctor --fix --dry-run
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

`--dry-run` never touches disk. It exists so you can review exactly what would change before committing to it.

## Apply a fix

Drop `--dry-run` and add `--yes` (fix mode, like every other output-writing command, refuses to run non-interactively without it):

```bash
$ npx setup-doctor --fix --yes
1 safe fix available:

INS-03  2 rules repeat within CLAUDE.md
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,4 +1,3 @@
 Always run the tests before committing.
 Use 2 space indentation.
-Always run the tests before committing.
 

Backed up 1 file(s) to .setupdoctor-backup/2026-09-29T10-36-49-285Z

Score before: 95   Score after: 100
Changes made:
  INS-03  CLAUDE.md: 2 rules repeat within CLAUDE.md
```

Three things happen, in order, every time:

1. **A backup first.** Every file a fix would touch is copied to `.setupdoctor-backup/<timestamp>/<scope>/<path>` before anything is written. This directory is already in `.gitignore` and is excluded from `setup-doctor`'s own file discovery, so a backup copy of a broken `CLAUDE.md` can never itself become a new finding.
2. **The diff, again**, so you have a record of exactly what changed even after the fact.
3. **Score before and after**, and a summary of what changed, so you can confirm the fix actually helped.

## `--allow-dirty`: project-scope files and uncommitted changes

For a project-scope file, fix mode checks whether the project looks like it might have uncommitted git changes (specifically: whether a `.git` path exists at all: `setup-doctor` never runs `git` itself, so this is a conservative "might be dirty" check, not a real `git status`). If so, it refuses to touch the file unless you pass `--allow-dirty`:

```bash
$ npx setup-doctor --fix --yes
No safe fixes available.

Findings that could not be auto-fixed:
  INS-03 CLAUDE.md: project may have uncommitted git changes; pass --allow-dirty
$ npx setup-doctor --fix --yes --allow-dirty
# ... applies normally
```

Global-scope files (your per-user config, outside any git repo) are not affected by this check.

## SET-02: removing a broken hook

```bash
$ npx setup-doctor --fix --dry-run
1 safe fix available:

SET-02  Hook PreToolUse in .claude/settings.json points to /path/to/project/scripts/missing.sh which is missing or not executable
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -1,16 +1,7 @@
 {
   "hooks": {
     "PreToolUse": [
       {
-        "matcher": "Bash",
-        "hooks": [
-          {
-            "type": "command",
-            "command": "./scripts/missing.sh"
-          }
-        ]
-      },
-      {
         "matcher": "Edit",
         "hooks": [
           {
             "type": "command",
             "command": "npx prettier --write ."
           }
         ]
       }
     ]
   }
 }

Dry run: no files changed.
```

Unlike INS-03, this is a real JSON edit, not a text-level line deletion: the file is parsed, the one broken hook is removed structurally, and the result is re-serialized, so a working sibling hook in the same file (`Edit` above) is left untouched and the file stays valid JSON. If your `settings.json`'s formatting can't be reproduced exactly on re-serialization (unusual indentation, for example), the fix is skipped rather than risk silently reformatting parts of the file you never asked to change.

## Why the safe set is small

Every rule is checked against the same bar INS-03 and SET-02 both had to clear: the fix must be genuinely mechanical, with no judgment call about *what* to put in place of the problem, only removing or normalizing something already broken. Most findings fail that bar (a wrong MCP command needs a human to say what the right one is; a too-short skill description needs a human to write more; a permission rule might be intentional even if it looks broad), so `setup-doctor` explains the problem and leaves the decision to you rather than guessing.
