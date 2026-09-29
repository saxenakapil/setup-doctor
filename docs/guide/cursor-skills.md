# Using Doctor and Wrapped as Cursor skills

Cursor has its own real, current skills mechanism (`SKILL.md`, the same YAML-frontmatter-plus-markdown-body shape Claude Code and Copilot CLI already use) but no plugin marketplace for third-party project skills the way Claude Code does; there is no one-command install. [`skills-cursor/`](../../skills-cursor/) ships two ready-to-copy skills instead.

## Install

Copy both folders into your project's `.cursor/skills/`:

```bash
mkdir -p .cursor/skills
cp -r skills-cursor/doctor .cursor/skills/
cp -r skills-cursor/wrapped .cursor/skills/
```

(`skills-cursor/` is included in this project's own repository and in the published npm package, so either a clone or `node_modules/setup-doctor/skills-cursor/` after `npm install setup-doctor` works as a source.)

Cursor picks them up automatically; no restart is required for a project-scope skill, and no configuration beyond the copy itself.

## What each one does

- **`doctor`**: runs `setup-doctor doctor --agent cursor`, explains the score and findings, and offers `--format html`, `badge`, `explain <RULE_ID>` and a `--fix --dry-run` preview as follow-ups.
- **`wrapped`**: runs `setup-doctor wrapped --agent cursor`, reports the headline numbers and persona, and explains upfront that cost shows as not available for Cursor (it bills through its own subscription/quota system, not a metered per-token API, so the tool does not guess at a dollar figure) and that Wrapped needs Node 22.5+.

Both are close copies of the Claude Code plugin's own `skills/doctor` and `skills/wrapped`, adapted in two ways: the description drops Claude Code's `/setup-doctor:doctor`-style slash-command mention (meaningless outside Claude Code), and each command is pinned to `--agent cursor` rather than auto-detecting, since a skill installed specifically into a Cursor project is reasonably assumed to be asked about Cursor's own setup and usage, not whichever other agent's config happens to also be present.

## Verified against setup-doctor's own Doctor

Both files were checked the same way any other Cursor project's skills would be: copied into a real scratch project's `.cursor/skills/`, then audited with `setup-doctor doctor --agent cursor` itself (this project's own Cursor skills-auditing coverage, see `docs/notes.md`'s Phase 17 entry). A first pass found a real false positive worth knowing about: `SKL-05` (broken relative link) flagged the literal text "n/a" in `wrapped/SKILL.md` as an unresolvable path, since the rule's own link-detection heuristic (`src/core/text.ts`'s `isCandidateRelativePath`) treats any token containing a `/` as a path candidate, with no exception for common non-path abbreviations. Worked around in these two files by rewording ("not available" instead of "n/a"); the heuristic itself was left as-is (a real, pre-existing, separate limitation, not something to patch as part of distributing these skills). The final pair scores a clean 100/100 against a real scratch project.
