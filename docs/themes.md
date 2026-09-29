# Setup Doctor: Themes

Three visual themes ship in v1. `playful` is the default. Mockups of every theme, for both outputs, are on the visual directions canvas: https://claude.ai/artifact/LEHQZFWMJVd7Xw3KV4rir3 (sample data). If this document and the mockups differ, this document wins.

## 1. Rules

- One shared layout per output. Each theme is a token set (colors, fonts, radii, borders, shadow). A fourth theme must be addable by adding one file in `src/render/themes/`.
- Themes apply to: the HTML report, the Wrapped card (SVG and PNG), and the badge SVG. The terminal report and JSON are not themed.
- Select with `--theme playful|technical|mix` or the `theme` key in `.setupdoctorrc`. Default `playful`. Record the theme in the JSON output.
- No network access. Fonts are bundled and embedded (section 5).
- Contrast: all text must meet WCAG AA (4.5:1, or 3:1 at 24 px and above). Color never carries meaning alone: severity and status also show as text (HIGH, MED, LOW, the numeric score).
- Do not use emoji in outputs. Do not show the "Sample data" label in real outputs; the mockups only used it to mark demo numbers.

## 2. Token sets

### 2.1 playful (default)

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#FFF4E0` | Page and card ground |
| `surface` | `#FFFDF7` | Finding cards |
| `ink` | `#1A1A1A` | Text and borders |
| `muted` | `#4A4A4A` | Secondary text |
| `accent` | `#FF5A3C` | Bars, HIGH tag, card ground on Wrapped |
| `accent2` | `#FFD447` | Score panel, MED tag, persona tile |
| `track` | `#FFE3B3` | Empty part of bars |
| `good` | `#3DDC84` | Not used for fills; bands use the badge colors in `scope.md` 12.2 |
| `border` | `3px solid #1A1A1A` (panels), `2px solid #1A1A1A` (cards, bars) | |
| `radius` | 28 px panels, 18 px cards, 999 px pills | |
| `shadow` | `8px 8px 0 #1A1A1A` on the score panel and persona tile | Hard offset, no blur |
| `displayFont` | Bricolage Grotesque, weights 600 and 800 | Titles, numbers |
| `bodyFont` | Figtree, weights 400, 600, 700 | Body text |
| `monoFont` | not used | |

### 2.2 technical

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B0F14` | Ground |
| `panel` | `#111820` | Panels and cards |
| `border` | `1px solid #223041` | |
| `ink` | `#D6DEE7` | Text |
| `muted` | `#8A9BAE` | Secondary text |
| `good` | `#3DDC84` | Score, good bars, prompt character |
| `warn` | `#F2B84B` | Medium bars and MED tag |
| `bad` | `#FF6B6B` | Low bars and HIGH tag |
| `link` | `#7AB8FF` | Rule IDs |
| `track` | `#2A3644` | Empty part of bars |
| `radius` | 6 px | |
| `shadow` | none | |
| `font` | JetBrains Mono, weights 400 and 700, for everything | |

Bars use block characters (`█`) in a monospace row: 20 cells total, filled cells colored by ratio, empty cells in `track`.

### 2.3 mix

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B0F14` | Ground |
| `panel` | `#111820` | Panels and cards |
| `border` | `2px solid #223041` | |
| `ink` | `#F3EEE3` | Text |
| `muted` | `#8A9BAE` | Secondary text |
| `accent` | `#FF6B4A` | HIGH tag, low bars, persona shadow, badge value |
| `accent2` | `#FFD447` | Score numeral, MED tag, medium bars, persona tile |
| `good` | `#3DDC84` | Good bars, GOOD pill, prompt character |
| `link` | `#7AB8FF` | Rule IDs |
| `track` | `#1B2530` | Empty part of bars |
| `radius` | 16 px panels, 14 px tiles, 12 px cards, 999 px bars and pills | |
| `shadow` | `8px 8px 0 #FF6B4A` on the score panel and persona tile | Hard offset, no blur |
| `displayFont` | Bricolage Grotesque, weights 600 and 800 | Score, headings, numbers |
| `monoFont` | JetBrains Mono, weights 400 and 700 | Commands, labels, IDs, fix lines |

Bar colors in `technical` and `mix`, by category fraction: 80 percent or more good, 51 to 79 percent warn (yellow), 50 percent or less bad (coral in `mix`, red in `technical`). In `playful` all filled bars use `accent`.

## 3. HTML report layout (all themes)

Width 760 px content area, centered, responsive down to 360 px (stack the score panel). Sections in order:

1. Header line: tool name (playful) or the prompt line `$ npx setup-doctor` (technical, mix), plus rules version on the right.
2. Score panel: large score numeral, `/100`, band pill (GOOD, and so on), one-line headline (`Healthy setup. N fixes to look at first.` where N is the count of high and critical findings, or `Nice work. No urgent fixes.` when zero), and the line `Always-loaded context: about N tokens`.
3. "Where the points went": six rows (category name, bar, `score/weight`). Rows for non-applicable categories are hidden.
4. "Fix these first": the top 4 findings by severity as cards: severity tag, rule ID, message, `Fix:` line. A "Show all N findings" control expands the full list, with a severity filter (the only inline JavaScript allowed).
5. Suppressed and skipped items: collapsed lists.
6. Footer: badge row (`Show it off in your README`, the command `npx setup-doctor badge`, a badge preview) and the privacy footer from PR-8.

Sizes (playful): score numeral 168 px display 800; headings 24 px; card message 18 px 700; body 15 to 16 px. `technical` and `mix`: score numeral 88 px (technical) or 150 px (mix); body 14 px mono.

## 4. Wrapped card layout

Two sizes from one template: 1200 by 630 (landscape, link previews) and 1080 by 1350 (portrait, stacks the two columns). Content per `scope.md` 12.3.

Landscape structure, left column (grows) and right column (340 px):

- Left: eyebrow (`Setup Doctor · Wrapped` in playful; the command line `$ npx setup-doctor wrapped --period 30d` in technical and mix), headline `Your last <period> with Claude Code`, a 2 by 2 grid of stat tiles (sessions, active days, tokens, est. cost with asterisk), footnote `* API-equivalent estimate, not your bill`. In `technical` the stats are a six-row list (adds busiest hour and longest streak) instead of tiles. In `technical` and `mix` add the activity strip (30 cells, one per day, five intensity levels from `track` to `accent`/`good`).
- Right: persona tile (label from `scope.md` 11.5, tilted -3 degrees in playful and mix), two small tiles (busiest hour, best streak), and the command pill `npx setup-doctor wrapped` at the bottom.
- Playful: card ground is `accent` (coral), tiles are cream with hard black borders and offset shadows, persona tile is yellow. Mix: dark ground, persona tile yellow with coral hard shadow. Technical: dark ground, no persona tilt, persona shown as a panel with the label in `good`.

Card text sizes (landscape): headline 54 to 60 px display; stat numbers 56 to 64 px; labels 13 to 14 px uppercase with 1 px letter spacing.

Privacy: the card never shows file paths, project names (unless `--show-projects`), usernames or prompts.

## 5. Fonts

| Font | Themes | License | Files to bundle (subsetted WOFF2) |
| --- | --- | --- | --- |
| Bricolage Grotesque | playful, mix | SIL Open Font License 1.1 | 600, 800 |
| Figtree | playful | SIL Open Font License 1.1 | 400, 600, 700 |
| JetBrains Mono | technical, mix | SIL Open Font License 1.1 | 400, 700 |

- Verify each license and include the license text in `src/data/fonts/LICENSES.md` and in the published package.
- Subset to Basic Latin plus the punctuation, digits and block characters the outputs use (`█`, `·`, `/`, `%`, `$`, `*`). Keep the total font payload small enough to meet the 1 MB installed-size target.
- Embed as base64 `@font-face` rules in the HTML report and in the SVG. For PNG export with `@resvg/resvg-js`, pass the font files explicitly to the renderer.
- Fallback stacks if a font fails to load: display `'Arial Black', 'Helvetica Neue', system-ui, sans-serif`; body `system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`; mono `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`.
- Never reference Google Fonts or any remote font URL.

## 6. Badge SVG

Two-part flat badge, height 20 px, text 11 px, drawn by the tool (no remote font, no network): left part label `setup doctor`, right part `<score> <Band>`. Colors: left `track` of the theme, right by band (Excellent `#3DDC84`, Good `#B5D33D`, Needs work `#FFB347`, Poor `#FF6B6B`); text dark `#0B0F14` on colored parts, light on dark parts. The printed shields.io snippet uses the shields color names in `scope.md` 12.2.

## 7. Implementation notes

- `src/render/themes/index.ts` exports `getTheme(name): Theme` and the list of valid names.
- `Theme` holds the tokens above plus small style switches (`hardShadow`, `barStyle: 'rounded' | 'blocks'`, `persona: 'tilted' | 'panel'`, `activityStrip: boolean`).
- Render functions take `(model, theme)` and must be pure and deterministic.
- Snapshot-test the HTML and SVG output for every theme with fixed sample data.
