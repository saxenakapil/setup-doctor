---
name: wrapped
description: Creates a shareable usage summary card from the user's local coding agent session logs (sessions, tokens, estimated cost, streaks, busiest hours). Use when the user asks for their Wrapped, a usage recap or stats card, or how much they've used their coding agent.
---

# Setup Doctor: Wrapped

Run the Setup Doctor CLI to build a usage summary and card from local logs. Nothing leaves the machine.

## Steps

1. Ask which period the user wants if they did not say. Default to 30 days.
2. Run `npx setup-doctor wrapped --period 30d` (adjust `--period` to `7d`, `ytd`, `all`, or a `YYYY-MM-DD:YYYY-MM-DD` range).
3. Report the headline numbers and the persona label, then tell the user where the card file was written.
4. Mention that cost is an API-equivalent estimate, not their bill.

## Rules

- Add `--anonymize` if the user plans to share the output and has project names they want hidden. The card hides project names by default.
- Offer a theme with `--theme playful`, `--theme technical` or `--theme mix`. The default is playful.
- Never read or quote message content from session logs. The tool only uses metadata.
- If the tool reports that no session logs were found or parsed, say so plainly. Do not invent numbers.
