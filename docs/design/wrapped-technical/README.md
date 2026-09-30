# Wrapped card, technical theme: design reference

This folder is the visual source of truth for the **technical** Wrapped card (landscape 1200 x 630 and portrait 1080 x 1350). Build the SVG generator to match it. Do not redesign it.

## 0. Precedence

For the `technical` theme, this folder wins over `docs/themes.md` section 4 and `docs/scope.md` section 12.3. Where those describe the technical card differently (for example an hour-of-day chart, or the persona line), follow this folder. The `playful` and `mix` themes are not covered here.

## 1. Files

| File | What it is |
| --- | --- |
| `landscape.html`, `portrait.html` | Static HTML/CSS reference. Open in a browser. Sample data. Layout truth |
| `landscape.png`, `portrait.png` | Rendered reference at 1x (Chromium, JetBrains Mono). Use for visual comparison and as golden images |
| `layout-landscape.json`, `layout-portrait.json` | Measured box (x, y, w, h) and font size of every element, plus all 35 grid cells. Use these numbers for SVG coordinates |
| `fonts/` | JetBrains Mono Regular and Bold (SIL OFL 1.1, license text included) |
| `render-reference.py` | Regenerates the PNG and JSON from the HTML (needs Python and Playwright). Optional |

## 2. Rules for Claude Code

1. Reproduce this design exactly: same layout, sizes, colors, spacing and copy. Do not add, remove or restyle elements.
2. The shipped output is **SVG** (plus optional PNG through `@resvg/resvg-js`). It must not use `<foreignObject>`, CSS layout, external fonts or any network reference. Draw with `<rect>`, `<text>`, `<linearGradient>` and `<path>` at absolute coordinates.
3. The HTML files are a reference only. Never ship them or load anything from this folder at runtime.
4. Keep every tunable value (colors, sizes, offsets) in one theme module, following `docs/themes.md` section 7.
5. Render your SVG to PNG at 1x with the bundled fonts and compare it with `landscape.png` and `portrait.png`. Keep those PNGs as golden fixtures in `test/fixtures/`. A visual match is the acceptance test.
6. No em dashes anywhere in code, comments or output text.
7. If something is not covered here, choose the simplest option, and log it in `docs/notes.md` under Assumptions.

## 3. Design tokens (technical)

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B0F14` | Card ground |
| `ink` | `#D6DEE7` | Default text, stat values |
| `inkStrong` | `#F0F4F8` | Hero value, streak ring |
| `muted` | `#8A9BAE` | Labels, secondary text |
| `accent` | `#3DDC84` | Prompt `$`, persona name, brightest grid level |
| `panel` | `#111820` | Persona and activity panels |
| `panelBorder` | `#223041` | 1px border on those panels |
| `glassFill` | vertical gradient white at 5 percent opacity (top) to 2 percent (bottom) | Stat cards |
| `glassBorder` | `rgba(255,255,255,0.09)` 1px | Stat cards |
| `glassHighlight` | inset 1px top line, `rgba(255,255,255,0.06)` | Stat cards |
| Grid levels 0 to 4 | `#161E27`, `#12331F`, `#1D6B3A`, `#2FA85B`, `#3DDC84` | Activity cells and legend |
| Streak ring | 2px inside stroke, `#F0F4F8` | Cells in the longest streak |
| Font | JetBrains Mono 400 and 700 | Everything |

Radii: panels 6px (landscape) and 12px (portrait, activity) or 8px (portrait, persona); stat cards 10px (landscape) and 12px (portrait); grid cells 4px (landscape) and 6px (portrait); legend squares 2px (landscape) and 4px (portrait).

## 4. Text metrics (needed for SVG)

JetBrains Mono is monospaced: every glyph advances exactly **0.6 x font size**. Text width = characters x 0.6 x fontSize + (characters - 1) x letterSpacing. Ascent 1.02 em, descent 0.30 em.

The reference boxes in the JSON are CSS boxes. To place SVG text, compute the baseline:

```
lineBox   = lineHeight * fontSize                // lineHeight is the CSS multiplier
content   = (1.02 + 0.30) * fontSize
baselineY = boxTop + (lineBox - content) / 2 + 1.02 * fontSize
```

Line heights used: hero value 1.05, persona name 1.05, stat value 1.2, persona line 1.4, everything else 1.5. Letter spacing: hero value -3px (landscape) and -5px (portrait); persona name -1px (landscape) and -1.5px (portrait). SVG `letter-spacing` is supported by resvg; verify against the golden PNG.

SVG conversions: the glass gradient is a `linearGradient` (top to bottom) inside a rect with a 1px stroke; the inset top highlight is a 1px line at the card top, inset by the corner radius; the streak ring is a rect inset by 1px with a 2px stroke and radius minus 1.

## 5. Landscape layout (1200 x 630, padding 48)

Left column x 48 to 696 (w 648), right column x 752 to 1152 (w 400), gap 56. Content area height 499 (y 48 to 547). Footer at y 561. Left column distributes header, hero and stat grid with equal free space between them (space-between).

| Element | x | y | w | h | font px |
| --- | --- | --- | --- | --- | --- |
| header block | 48 | 48 | 648 | 46.5 |  |
| command line | 48 | 48 | 648 | 24 | 16 |
| subtitle line | 48 | 72 | 648 | 22.5 | 15 |
| hero block | 48 | 146.2 | 648 | 141.6 |  |
| hero label | 48 | 146.2 | 648 | 24 | 16 |
| hero value | 48 | 170.2 | 648 | 117.6 | 112 |
| stat grid | 48 | 339.4 | 648 | 207.6 |  |
| stat card 1 | 48 | 339.4 | 205.3 | 95.8 |  |
| stat card 2 | 269.3 | 339.4 | 205.3 | 95.8 |  |
| stat card 3 | 490.7 | 339.4 | 205.3 | 95.8 |  |
| stat card 4 | 48 | 451.2 | 205.3 | 95.8 |  |
| stat card 5 | 269.3 | 451.2 | 205.3 | 95.8 |  |
| stat card 6 | 490.7 | 451.2 | 205.3 | 95.8 |  |
| stat 1 label | 69 | 356.4 | 163.3 | 21 | 14 |
| stat 1 value | 69 | 377.4 | 163.3 | 40.8 | 34 |
| persona panel | 752 | 48 | 400 | 152 |  |
| persona label | 777 | 71.8 | 350 | 21 | 14 |
| persona name | 777 | 98.8 | 350 | 50.4 | 48 |
| persona line | 777 | 155.2 | 350 | 21 | 15 |
| activity panel | 752 | 220 | 400 | 327 |  |
| activity title row | 777 | 239 | 350 | 21 |  |
| weekday header row | 777 | 268 | 350 | 18 |  |
| activity grid | 777 | 294 | 350 | 182 |  |
| legend: less/more | 777 | 484 | 350 | 18 |  |
| legend: streak | 777 | 510 | 350 | 18 |  |
| footer row | 48 | 561 | 1104 | 21 |  |
| footer left text | 48 | 561 | 432 | 21 | 14 |
| footer right text | 752 | 561 | 400 | 21 | 14 |

Activity grid cells: 43.1 x 30, gap 8. Cell at column c (0 = Monday) and row r: `x = 777 + c * 51.1`, `y = 294 + r * 38`. Exact positions of all 35 cells are in `layout-landscape.json` (ids ending in `-cell`).

Stat card text: label at card x + 21, value below it; card padding 16px vertical, 20px horizontal, plus the 1px border. Card order left to right, top to bottom: sessions, active days, est. cost *, busiest hour, longest streak, cache hit.

## 6. Portrait layout (1080 x 1350, padding 56)

Single column, vertical space distributed equally between blocks (space-between, minimum gap 16). Row 1 holds the hero (left, w 496) and the persona panel (right, x 584, w 440), gap 32.

| Element | x | y | w | h | font px |
| --- | --- | --- | --- | --- | --- |
| header block | 56 | 56 | 968 | 60 |  |
| command line | 56 | 56 | 968 | 33 | 22 |
| subtitle line | 56 | 89 | 968 | 27 | 18 |
| row 1 (hero + persona) | 56 | 142.1 | 968 | 210.7 |  |
| hero block | 56 | 142.1 | 496 | 210.7 |  |
| hero label | 56 | 148.4 | 496 | 30 | 20 |
| hero value | 56 | 178.4 | 496 | 168 | 160 |
| persona panel | 584 | 142.1 | 440 | 210.7 |  |
| persona label | 615 | 171.1 | 378 | 24 | 16 |
| persona name | 615 | 203.1 | 378 | 56.7 | 54 |
| persona line | 615 | 267.8 | 378 | 56 | 20 |
| stat grid | 56 | 378.8 | 968 | 282 |  |
| stat card 1 | 56 | 378.8 | 309.3 | 131 |  |
| stat card 2 | 385.3 | 378.8 | 309.3 | 131 |  |
| stat card 3 | 714.7 | 378.8 | 309.3 | 131 |  |
| stat card 4 | 56 | 529.8 | 309.3 | 131 |  |
| stat card 5 | 385.3 | 529.8 | 309.3 | 131 |  |
| stat card 6 | 714.7 | 529.8 | 309.3 | 131 |  |
| stat 1 label | 81 | 399.8 | 259.3 | 27 | 18 |
| stat 1 value | 81 | 428.8 | 259.3 | 60 | 50 |
| activity panel | 56 | 686.9 | 968 | 557 |  |
| activity title row | 97 | 723.9 | 886 | 27 |  |
| weekday header row | 97 | 764.9 | 886 | 24 |  |
| activity grid | 97 | 802.9 | 886 | 328 |  |
| legend: less/more | 97 | 1144.9 | 886 | 24 |  |
| legend: streak | 97 | 1182.9 | 886 | 24 |  |
| footer row | 56 | 1270 | 968 | 24 |  |
| footer left text | 56 | 1270 | 540 | 24 | 16 |
| footer right text | 674 | 1270 | 350 | 24 | 16 |

Activity grid cells: 116.3 x 56, gap 12. Cell at column c and row r: `x = 97 + c * 128.3`, `y = 802.9 + r * 68`. All 35 positions are in `layout-portrait.json`.

Stat card padding 20px vertical, 24px horizontal; label 18px, value 50px, gap 2px.

## 7. Data binding

| Element | Source (`docs/scope.md` section 11.3) | Format |
| --- | --- | --- |
| Command line | The period actually used | `$ npx setup-doctor wrapped --period 30d` (the flag mirrors `--period`) |
| Subtitle | Period and agent | `last 30 days · Claude Code` (use a plain description for other periods, for example `last 7 days`, `year to date`, `all time`, `Sep 1 to Sep 30`) |
| Hero | Total tokens (input + output + cache read + cache write) | Compact: under 1,000 as is; `12.3K`; `1.2M`; `48.2M`; `1.5B`. One decimal, drop a trailing `.0` |
| sessions | Sessions | Integer with thousands separators |
| active days | Active days | Integer |
| est. cost * | Estimated cost | `$` plus integer with thousands separators; under `$10` show two decimals (`$4.20`) |
| busiest hour | Busiest hour | 24-hour `HH:00`, local time or `--tz` |
| longest streak | Longest streak | `12 days`, or `1 day` |
| cache hit | Cache hit rate | Rounded percent, `88%` |
| Persona | Persona rules (section 11.5) | Name uppercase, plus its line (see section 8) |
| Activity title | Period | `activity, last 30 days` and the date range on the right (`Sep 1 to Sep 30`) |
| Footer left | Fixed | `* API-equivalent estimate, not your bill` (no `sample data` in real output) |
| Footer right | Fixed | Landscape: `setup-doctor · github.com/saxenakapil/setup-doctor`. Portrait: `github.com/saxenakapil/setup-doctor` |

Do not show project names, file paths, usernames or any prompt text. The `--show-projects` flag does not affect this card in v1.

## 8. Persona names and lines

| Persona | Name shown | Landscape line (one line) | Portrait line (explicit break) |
| --- | --- | --- | --- |
| Night Owl | NIGHT OWL | Most of your messages land after dark. | Most of your messages / land after dark. |
| Marathoner | MARATHONER | Your longest session ran past 4 hours. | Your longest session / ran past 4 hours. |
| Cache Master | CACHE MASTER | Your cache did the heavy lifting. | Your cache did the / heavy lifting. |
| Streak Keeper | STREAK KEEPER | You showed up day after day. | You showed up / day after day. |
| Steady Builder | STEADY BUILDER | Steady, consistent use. | Steady, consistent use. |

Note the Cache Master line changed from `docs/scope.md` section 11.5 to fit; update that section to match.

## 9. Fitting text (no overflow, ever)

Because the font is monospaced, fit is computed, not measured. For every value: `fit = min(1, maxWidth / textWidth)` and use `fontSize * fit`, but never below 60 percent of the nominal size.

| Text | Landscape max width | Portrait max width |
| --- | --- | --- |
| Hero value | 648 | 496 |
| Persona name | 350 | 378 |
| Persona line (15px landscape, 20px portrait) | 350 | 378 |
| Stat value (34px landscape, 50px portrait) | 163 | about 258 |

If a persona line would still overflow at the fit floor, wrap it at a space (portrait) or truncate with `...` (landscape). `STEADY BUILDER` and `STREAK KEEPER` need the fit rule at the nominal sizes.

## 10. Activity grid rules

- Columns are Monday to Sunday. Rows are calendar weeks. The first row starts with blank cells before the period start; the last row ends with blank cells. Blank cells are drawn as nothing.
- **Assumption, confirm:** the grid shows at most the last 35 days ending on the period end. For a period of 35 days or fewer it shows exactly the period and the title reads `activity, last N days`. For longer periods (`ytd`, `all`, or over 35 days) it shows the last 5 weeks and the title reads `activity, last 5 weeks`.
- Level 0 means no messages that day. For the other days, compute the quartiles (25th, 50th, 75th percentile) of the day counts of active days; level 1 is up to the 25th, level 2 up to the 50th, level 3 up to the 75th, level 4 above. Deterministic, no randomness.
- The longest streak (from the metrics) is outlined with the ring. If the longest streak is shorter than 2 days, draw no ring and omit the streak legend row.
- The scale legend (`less` to `more`) is always shown.

## 11. States and edge cases

| Situation | Behavior |
| --- | --- |
| `--no-cost` | Remove the est. cost card and the asterisk footnote. The stat grid becomes 5 cards: the second row has 2 cards that split the row width equally. Footer left is omitted |
| No sessions in the period | Keep header, footer and one centered panel with `No sessions in this period.` and the hint `Try --period 90d.` |
| Unknown model (cost `n/a`) | Show `n/a` in the cost card and keep the footnote |
| Very large numbers | Apply the compact format and the fit rule |
| Fewer than 2 active days | Persona is Steady Builder; no streak ring |
| Theme flag | This design is the `technical` theme. Other themes use their own designs |

## 12. Accessibility

Add `<title>` and `<desc>` to the SVG, for example: `Setup Doctor Wrapped, last 30 days` and `48.2M tokens, 142 sessions, 26 active days, 12 day longest streak, persona Night Owl.` Use `role="img"` on the root. Contrast of every text color on its background meets WCAG AA (muted `#8A9BAE` on `#0B0F14` is about 7:1).

## 13. Sample data used in the reference

Tokens 48.2M, sessions 142, active days 26, est. cost $312, busiest hour 23:00, longest streak 12 days (Sep 8 to Sep 19), cache hit 88%, persona Night Owl. Period Sep 1 to Sep 30 (Sep 1 is a Tuesday). Day levels for Sep 1 to 30: `2,3,4,3,2,0,0,3,4,4,3,2,3,4,3,2,3,4,3,0,3,2,3,4,2,3,0,3,4,3`. Use this exact data for the golden tests.
