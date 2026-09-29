# Fix mode

`setup-doctor` is read-only everywhere except `--fix`. Even then, it never edits a file without showing you the diff first, and never applies anything without your explicit confirmation.

## The safe set

Not every finding is fixable. As of this version, the only automatically-fixable rule is **INS-03** (an exact duplicate line repeated within one instruction file). Everything else needs a human judgment call (what MCP command should this actually be? is this permission rule intentional?), so `setup-doctor` will tell you what is wrong and how to fix it, but will not guess for you.

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

## Why the safe set is so small

Expanding it is tracked in [`docs/notes.md`](../notes.md)'s backlog, not silently deferred: candidates include swapping a retired model name (FRS-02), rewrapping an out-of-range skill description (SKL-02), and disabling a server nobody has used recently (MCP-04), each only after it proves genuinely safe and mechanical to automate, the same bar INS-03 had to clear.
