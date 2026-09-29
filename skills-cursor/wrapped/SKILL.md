---
name: wrapped
description: Creates a shareable usage summary card from the user's local Cursor session logs (sessions, tokens, streaks, busiest hours). Use when the user asks for their Wrapped, a usage recap or stats card, or how much they've used Cursor.
---

# Setup Doctor: Wrapped

Run the Setup Doctor CLI to build a usage summary and card from local Cursor logs. Nothing leaves the machine. Needs Node 22.5 or later (Cursor Wrapped reads Cursor's local database via the built-in `node:sqlite` module); if the tool reports an older Node version, say so plainly rather than retrying.

## Steps

1. Ask which period the user wants if they did not say. Default to 30 days.
2. Run `npx setup-doctor wrapped --agent cursor --period 30d` (adjust `--period` to `7d`, `ytd`, `all`, or a `YYYY-MM-DD:YYYY-MM-DD` range).
3. Report the headline numbers and the persona label, then tell the user where the card file was written.
4. Cost shows as not available for Cursor: Cursor bills through its own subscription/quota system, not a metered per-token API, so the tool does not guess at a dollar figure. Say so if the user asks about cost, rather than treating that as an error.

## Rules

- Add `--anonymize` if the user plans to share the output and has project names they want hidden. The card hides project names by default.
- Offer a theme with `--theme playful`, `--theme technical` or `--theme mix`. The default is playful.
- Never read or quote message content from session logs. The tool only uses metadata.
- If the tool reports that no session logs were found or parsed, say so plainly. Do not invent numbers.
