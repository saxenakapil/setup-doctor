# Cursor skills

Two skills let Cursor run `setup-doctor` for you: one audits your Cursor setup, and one summarizes usage. Cursor does not have a plugin marketplace for project skills, so you copy the skills into your project.

## Install

Copy both folders from [`skills-cursor/`](../../skills-cursor/) into your project's `.cursor/skills/` directory:

```bash
mkdir -p .cursor/skills
cp -r skills-cursor/doctor .cursor/skills/
cp -r skills-cursor/wrapped .cursor/skills/
```

The `skills-cursor/` folder is included in the npm package, so `node_modules/setup-doctor/skills-cursor/` works as a source too.

Cursor loads project skills automatically. No restart or configuration is required.

## Skills

| Skill | What it does |
| --- | --- |
| `doctor` | Runs `setup-doctor doctor --agent cursor`, explains the score and findings, and offers follow-up commands: an HTML report, a badge, rule explanations and a fix preview. |
| `wrapped` | Runs `setup-doctor wrapped --agent cursor`, reports the headline figures and persona, and notes that cost is not available for Cursor. |

Both skills are pinned to `--agent cursor`. A skill installed in a Cursor project is assumed to be about Cursor, not about any other agent whose files happen to be present.

The skills run the latest published version of `setup-doctor` through `npx`.

## Requirements

- Node.js 20 or later for `doctor`
- Node.js 22.5 or later for `wrapped`, because it reads Cursor's local database with the built-in `node:sqlite` module

## Notes

Cost is shown as `n/a` for Cursor. Cursor bills through its own subscription and quota system, so `setup-doctor` does not estimate a dollar amount. See [Wrapped](wrapped.md#agents) for details.

The skills are written to pass their own checks. You can audit them with `setup-doctor doctor --agent cursor` in a project that contains them.
