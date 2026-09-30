// Wrapped card SVG (both sizes, all three themes). See docs/scope.md
// section 12.3 and docs/themes.md section 4. PNG export is handled by the
// caller via the optional @resvg/resvg-js dependency (scope.md section 4).

import { embeddedFontFaceCss } from './fonts.js';
import type { Theme } from './themes/index.js';
import { TECH_CARD } from './themes/technical-card-tokens.js';
import type { ActivityCell } from '../wrapped/metrics.js';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function formatCost(costUsd: number | null): string {
  if (costUsd === null) return 'n/a';
  return `$${costUsd < 0.01 && costUsd > 0 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;
}

// K/M/B compact rounding, playful's stat tiles only (user-requested: "Round
// of token count to M/B, etc"). Not applied to technical/mix or to costs
// under $1,000/token counts under 1,000, where the exact figure is both
// short enough to fit and more informative than a rounded one.
function formatCompactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
}

function formatCompactCost(costUsd: number | null): string {
  if (costUsd === null) return 'n/a';
  if (Math.abs(costUsd) >= 1_000) return `$${formatCompactNumber(costUsd)}`;
  return formatCost(costUsd);
}

function buildPlayfulStatTiles(input: CardInput): StatTile[] {
  return [
    { label: 'Sessions', value: formatNumber(input.sessions) },
    { label: 'Active days', value: formatNumber(input.activeDays) },
    { label: 'Tokens', value: formatCompactNumber(input.totalTokens) },
    { label: 'Est. cost*', value: formatCompactCost(input.costUsd) },
  ];
}

// There is no text-measurement API available for a static SVG string built
// from template literals (no dependency is allowed to do real font
// shaping), so width is estimated from character count times an
// average-advance-width-per-em figure for the font family in use. This is
// deliberately conservative (a slight underestimate of size beats an
// overflowing, clipped title): monospace glyphs are all one fixed width,
// bold proportional glyphs average narrower. Custom --period ranges (e.g.
// "2026-01-01 to 2026-03-15 with Claude Code") make the title long enough
// that a fixed font-size clips behind the persona tile without this.
const MONO_AVG_ADVANCE_EM = 0.62;
const DISPLAY_AVG_ADVANCE_EM = 0.58;

function fitTitleFontSize(text: string, maxWidth: number, baseFontSize: number, isMono: boolean, minFontSize: number): number {
  const advance = isMono ? MONO_AVG_ADVANCE_EM : DISPLAY_AVG_ADVANCE_EM;
  const estimatedWidth = text.length * advance * baseFontSize;
  if (estimatedWidth <= maxWidth) return baseFontSize;
  return Math.max(minFontSize, Math.floor(maxWidth / (text.length * advance)));
}

export interface CardInput {
  theme: Theme;
  agentLabel: string;
  periodLabel: string;
  sessions: number;
  activeDays: number;
  totalTokens: number;
  costUsd: number | null;
  busiestHour: number | null;
  busiestWeekday: string | null;
  longestStreakDays: number;
  persona: { label: string; line: string };
  activity: ActivityCell[]; // 30 cells, oldest first
  showProjects: boolean;
  topProjects: { project: string; tokens: number }[];
  // technical theme's card only (docs/design/wrapped-technical/): the rest
  // of the fields above are reused, but this design also needs a couple
  // playful/mix never did.
  cacheHitRate?: number; // 0..1
  // Distinct from costUsd === null (which is also true for "unknown
  // model, cost is n/a" and must still show a cost card saying n/a):
  // false only means the user explicitly passed --no-cost, which removes
  // the cost card and its footnote entirely instead.
  showCost?: boolean;
}

interface StatTile {
  label: string;
  value: string;
}

function buildStatTiles(input: CardInput): StatTile[] {
  return [
    { label: 'Sessions', value: formatNumber(input.sessions) },
    { label: 'Active days', value: formatNumber(input.activeDays) },
    { label: 'Tokens', value: formatNumber(input.totalTokens) },
    { label: 'Est. cost*', value: formatCost(input.costUsd) },
  ];
}

function activityLevelColor(theme: Theme, level: number): string {
  if (level <= 0) return theme.colors.track;
  const goodish = theme.name === 'technical';
  const strong = goodish ? theme.colors.good : theme.colors.accent;
  // 4 non-empty steps, interpolated in opacity for a cheap 5-level ramp
  // without needing 4 separate hard-coded colors per theme.
  const opacity = [0, 0.35, 0.55, 0.75, 1][level] ?? 1;
  return strong + Math.round(opacity * 255).toString(16).padStart(2, '0');
}

function renderTitleDesc(input: CardInput): string {
  const title = `Setup Doctor Wrapped: ${input.periodLabel}`;
  const desc = `${input.sessions} sessions, ${input.activeDays} active days, ${formatNumber(input.totalTokens)} tokens, persona ${input.persona.label}.`;
  return `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>`;
}

function renderStatTiles(theme: Theme, tiles: StatTile[], x: number, y: number, tileW: number, tileH: number, gap: number): string {
  return tiles
    .map((tile, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = x + col * (tileW + gap);
      const ty = y + row * (tileH + gap);
      return `
        <g transform="translate(${tx},${ty})">
          <rect width="${tileW}" height="${tileH}" rx="${theme.radius.card}" fill="${theme.colors.surface}" stroke="${theme.colors.ink}" stroke-opacity="0.15"/>
          <text x="16" y="${tileH - 34}" font-family="${theme.fonts.display}" font-size="30" font-weight="800" fill="${theme.colors.ink}">${escapeXml(tile.value)}</text>
          <text x="16" y="${tileH - 12}" font-family="${theme.fonts.mono}" font-size="11" letter-spacing="1" fill="${theme.colors.muted}">${escapeXml(tile.label.toUpperCase())}</text>
        </g>`;
    })
    .join('');
}

function renderStatList(theme: Theme, input: CardInput, x: number, y: number): string {
  const rows = [
    ...buildStatTiles(input),
    { label: 'Busiest hour', value: input.busiestHour === null ? 'n/a' : `${String(input.busiestHour).padStart(2, '0')}:00` },
    { label: 'Longest streak', value: `${input.longestStreakDays} day${input.longestStreakDays === 1 ? '' : 's'}` },
  ];
  return rows
    .map(
      (row, i) => `
        <text x="${x}" y="${y + i * 28}" font-family="${theme.fonts.mono}" font-size="15" fill="${theme.colors.muted}">${escapeXml(row.label)}</text>
        <text x="${x + 220}" y="${y + i * 28}" font-family="${theme.fonts.mono}" font-size="15" font-weight="700" fill="${theme.colors.ink}">${escapeXml(row.value)}</text>`,
    )
    .join('');
}

function renderActivityStrip(theme: Theme, activity: ActivityCell[], x: number, y: number, totalWidth: number): string {
  if (activity.length === 0) return '';
  const cellGap = 3;
  const cellSize = (totalWidth - cellGap * (activity.length - 1)) / activity.length;
  const cells = activity
    .map((cell, i) => {
      const cx = x + i * (cellSize + cellGap);
      return `<rect x="${cx}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${activityLevelColor(theme, cell.level)}"><title>${escapeXml(cell.date)}</title></rect>`;
    })
    .join('');
  return `<g>${cells}</g>`;
}

function renderPersonaTile(theme: Theme, input: CardInput, x: number, y: number, w: number, h: number): string {
  const tilt = theme.persona === 'tilted' ? ` transform="translate(${x},${y}) rotate(-3)"` : ` transform="translate(${x},${y})"`;
  const fill = theme.name === 'technical' ? theme.colors.surface : theme.colors.accent2;
  const labelColor = theme.name === 'technical' ? theme.colors.good : '#1A1A1A';
  return `
    <g${tilt}>
      <rect width="${w}" height="${h}" rx="${theme.radius.card}" fill="${fill}" ${theme.hardShadow ? `stroke="${theme.colors.ink}" stroke-width="2"` : ''}/>
      <text x="16" y="30" font-family="${theme.fonts.mono}" font-size="12" letter-spacing="1" fill="${labelColor}">PERSONA</text>
      <text x="16" y="60" font-family="${theme.fonts.display}" font-size="24" font-weight="800" fill="${labelColor}">${escapeXml(input.persona.label)}</text>
      <text x="16" y="86" font-family="${theme.fonts.body}" font-size="13" fill="${labelColor}">${escapeXml(input.persona.line)}</text>
    </g>`;
}

function renderCommandPill(theme: Theme, x: number, y: number): string {
  const text = 'npx setup-doctor wrapped';
  const w = text.length * 7.5 + 32;
  return `
    <g transform="translate(${x},${y})">
      <rect width="${w}" height="28" rx="${theme.radius.pill}" fill="${theme.colors.track}"/>
      <text x="${w / 2}" y="18" font-family="${theme.fonts.mono}" font-size="12" text-anchor="middle" fill="${theme.colors.ink}">${escapeXml(text)}</text>
    </g>`;
}

function renderCostFootnote(theme: Theme, x: number, y: number): string {
  return `<text x="${x}" y="${y}" font-family="${theme.fonts.mono}" font-size="11" fill="${theme.colors.muted}">* API-equivalent estimate, not your bill</text>`;
}

function renderProjectsList(theme: Theme, projects: { project: string; tokens: number }[], x: number, y: number): string {
  if (projects.length === 0) return '';
  return projects
    .map(
      (p, i) =>
        `<text x="${x}" y="${y + i * 20}" font-family="${theme.fonts.mono}" font-size="12" fill="${theme.colors.muted}">${escapeXml(p.project)}, ${formatNumber(p.tokens)} tok</text>`,
    )
    .join('');
}

function eyebrowText(theme: Theme, input: CardInput): string {
  return theme.name === 'playful'
    ? 'Setup Doctor · Wrapped'
    : `$ npx setup-doctor wrapped --period ${input.periodLabel}`;
}

// ---- playful: bespoke card layout (post-v1 redesign, user-approved mockup) ----
//
// Deliberately not theme-token-driven the way the generic renderers above
// are: this look (white outer frame, an inset coral panel, a black persona
// box, the pill relocated above the title) doesn't map onto the shared
// Theme contract technical/mix/the HTML report/the badge all still use, and
// the user was explicit that only the Wrapped card should change, not the
// HTML report or badge. Reusing theme.colors.accent/ink keeps the actual
// hue in sync with playful.ts if that ever changes; everything else here
// (the near-black persona fill, the light persona body text, the pill and
// tile styling) is intentionally specific to this one layout.

const PLAYFUL_PERSONA_LINE = '#B8B0A8';
// #666666, not a lighter gray: checked directly against WCAG AA (4.5:1 for
// text this size) rather than assumed -- anything much lighter than this on
// a white tile fails. Coral is too light a ground for *any* light-toned
// text to clear 4.5:1 against it either (even white text only reaches
// ~3.1:1), so text sitting directly on the panel (the footnote) uses ink,
// not a light "muted" tone, for the same reason.
const PLAYFUL_MUTED_LABEL = '#666666';

function playfulProjectsList(theme: Theme, projects: { project: string; tokens: number }[], x: number, y: number): string {
  if (projects.length === 0) return '';
  return projects
    .map(
      (p, i) =>
        `<text x="${x}" y="${y + i * 20}" font-family="ui-monospace,'SF Mono',Menlo,Consolas,monospace" font-size="12" fill="${theme.colors.ink}">${escapeXml(p.project)}, ${formatNumber(p.tokens)} tok</text>`,
    )
    .join('');
}

function playfulFootnote(theme: Theme, x: number, y: number): string {
  // Full-opacity ink, not a lighter/translucent tone: checked directly,
  // ink at 70% opacity over the coral panel only reaches ~3.6:1, still
  // short of the 4.5:1 small-text minimum. Smaller font size alone carries
  // the "secondary text" hierarchy here instead.
  return `<text x="${x}" y="${y}" font-family="system-ui,'Segoe UI',Roboto,sans-serif" font-size="12" fill="${theme.colors.ink}">* API-equivalent estimate, not your bill</text>`;
}

function playfulPill(theme: Theme, x: number, y: number, fontSize: number): { markup: string; height: number } {
  const text = 'npx setup-doctor wrapped';
  const height = fontSize + 23;
  const width = text.length * (fontSize * 0.62) + 32;
  return {
    height,
    markup: `
    <g transform="translate(${x},${y})">
      <rect width="${width}" height="${height}" rx="${height / 2}" fill="#FFFFFF"/>
      <text x="${width / 2}" y="${height / 2 + fontSize * 0.35}" font-family="ui-monospace,'SF Mono',Menlo,Consolas,monospace" font-size="${fontSize}" font-weight="700" fill="#1A1A1A" text-anchor="middle">${escapeXml(text)}</text>
    </g>`,
  };
}

function playfulTitle(theme: Theme, text: string, x: number, y: number, fontSize: number): string {
  // paint-order + a same-color stroke thickens the glyphs beyond the
  // font's own heaviest bundled weight (800), closer to "as bold as
  // possible" without shipping a separate black-weight font file.
  return `<text x="${x}" y="${y}" font-family="${theme.fonts.display}" font-size="${fontSize}" font-weight="800" fill="${theme.colors.ink}" stroke="${theme.colors.ink}" stroke-width="1" paint-order="stroke fill" letter-spacing="-0.5">${escapeXml(text)}</text>`;
}

function playfulStatTiles(theme: Theme, tiles: StatTile[], x: number, y: number, tileW: number, tileH: number, gap: number, numberSize: number, labelSize: number): string {
  return tiles
    .map((tile, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = x + col * (tileW + gap);
      const ty = y + row * (tileH + gap);
      return `
        <g transform="translate(${tx},${ty})" filter="url(#playfulCardShadow)">
          <rect width="${tileW}" height="${tileH}" rx="18" fill="${theme.colors.surface}"/>
          <text x="24" y="${tileH - 38}" font-family="${theme.fonts.display}" font-size="${numberSize}" font-weight="800" fill="${theme.colors.ink}">${escapeXml(tile.value)}</text>
          <text x="24" y="${tileH - 16}" font-family="system-ui,'Segoe UI',Roboto,sans-serif" font-size="${labelSize}" font-weight="700" letter-spacing="1.2" fill="${PLAYFUL_MUTED_LABEL}">${escapeXml(tile.label.toUpperCase())}</text>
        </g>`;
    })
    .join('');
}

function playfulPersonaBox(theme: Theme, input: CardInput, x: number, y: number, w: number, h: number, nameSize: number): string {
  return `
    <g transform="translate(${x},${y})" filter="url(#playfulCardShadow)">
      <rect width="${w}" height="${h}" rx="20" fill="${theme.colors.ink}"/>
      <text x="32" y="46" font-family="system-ui,'Segoe UI',Roboto,sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="${theme.colors.accent}">PERSONA</text>
      <text x="32" y="${46 + nameSize}" font-family="${theme.fonts.display}" font-size="${nameSize}" font-weight="800" fill="#FFFFFF">${escapeXml(input.persona.label)}</text>
      <text x="32" y="${46 + nameSize + 30}" font-family="system-ui,'Segoe UI',Roboto,sans-serif" font-size="15" fill="${PLAYFUL_PERSONA_LINE}">${escapeXml(input.persona.line)}</text>
    </g>`;
}

function playfulSmallTile(theme: Theme, label: string, value: string, x: number, y: number, w: number, h: number, valueSize: number): string {
  return `
    <g transform="translate(${x},${y})" filter="url(#playfulCardShadow)">
      <rect width="${w}" height="${h}" rx="16" fill="${theme.colors.surface}"/>
      <text x="24" y="30" font-family="system-ui,'Segoe UI',Roboto,sans-serif" font-size="11" font-weight="700" letter-spacing="1.1" fill="${PLAYFUL_MUTED_LABEL}">${escapeXml(label.toUpperCase())}</text>
      <text x="24" y="${30 + valueSize * 0.9}" font-family="${theme.fonts.display}" font-size="${valueSize}" font-weight="800" fill="${theme.colors.ink}">${escapeXml(value)}</text>
    </g>`;
}

function playfulSvgDefs(): string {
  return `<defs>
    <filter id="playfulCardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#1A1000" flood-opacity="0.18"/>
    </filter>
    <filter id="playfulPanelShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="24" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  </defs>`;
}

function renderPlayfulLandscapeCard(input: CardInput): string {
  const { theme } = input;
  const W = 1200;
  const H = 630;
  const panelX = 28;
  const panelY = 28;
  const panelW = W - panelX * 2;
  const panelH = H - panelY * 2;
  const leftX = 76;
  const rightColW = 508;
  const rightX = W - panelX - 48 - rightColW;

  const titleText = `Your last ${input.periodLabel} with ${input.agentLabel}`;
  // Full content width, not rightX - leftX: unlike the two-column
  // technical/mix layout this title's row has nothing sitting to its right
  // (the persona box starts well below it), so it can use the whole panel.
  const titleFontSize = fitTitleFontSize(titleText, panelW - 48 * 2, 48, false, 26);

  const pill = playfulPill(theme, leftX, 64, 13);
  const statTiles = playfulStatTiles(theme, buildPlayfulStatTiles(input), leftX, 234, 242, 130, 16, 40, 11);
  const persona = playfulPersonaBox(theme, input, rightX, 234, rightColW, 180, 32);
  const busiestHourValue = input.busiestHour === null ? 'n/a' : `${String(input.busiestHour).padStart(2, '0')}:00`;
  const smallTileW = (rightColW - 16) / 2;
  const busiest = playfulSmallTile(theme, 'Busiest hour', busiestHourValue, rightX, 430, smallTileW, 80, 22);
  const streak = playfulSmallTile(theme, 'Best streak', `${input.longestStreakDays}d`, rightX + smallTileW + 16, 430, smallTileW, 80, 22);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
${playfulSvgDefs()}
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<g filter="url(#playfulPanelShadow)">
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="32" fill="${theme.colors.accent}" stroke="#1A1000" stroke-opacity="0.15" stroke-width="1.5"/>
</g>
${pill.markup}
${playfulTitle(theme, titleText, leftX, 64 + pill.height + 78, titleFontSize)}
${statTiles}
${persona}
${busiest}
${streak}
${playfulFootnote(theme, leftX, 540)}
${input.showProjects ? playfulProjectsList(theme, input.topProjects, leftX, 568) : ''}
</svg>
`;
}

function renderPlayfulPortraitCard(input: CardInput): string {
  const { theme } = input;
  const W = 1080;
  const H = 1350;
  const panelX = 28;
  const panelY = 28;
  const panelW = W - panelX * 2;
  const panelH = H - panelY * 2;
  const leftX = 76;
  const contentW = W - panelX - 48 - leftX;

  const titleText = `Your last ${input.periodLabel} with ${input.agentLabel}`;
  const titleFontSize = fitTitleFontSize(titleText, contentW, 52, false, 28);

  const pill = playfulPill(theme, leftX, 76, 15);
  const tileW = (contentW - 16) / 2;
  const statTiles = playfulStatTiles(theme, buildPlayfulStatTiles(input), leftX, 260, tileW, 150, 16, 44, 12);
  const persona = playfulPersonaBox(theme, input, leftX, 606, contentW, 200, 36);
  const busiestHourValue = input.busiestHour === null ? 'n/a' : `${String(input.busiestHour).padStart(2, '0')}:00`;
  const smallTileW = (contentW - 16) / 2;
  const busiest = playfulSmallTile(theme, 'Busiest hour', busiestHourValue, leftX, 826, smallTileW, 110, 26);
  const streak = playfulSmallTile(theme, 'Best streak', `${input.longestStreakDays}d`, leftX + smallTileW + 16, 826, smallTileW, 110, 26);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
${playfulSvgDefs()}
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<g filter="url(#playfulPanelShadow)">
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="32" fill="${theme.colors.accent}" stroke="#1A1000" stroke-opacity="0.15" stroke-width="1.5"/>
</g>
${pill.markup}
${playfulTitle(theme, titleText, leftX, 76 + pill.height + 86, titleFontSize)}
${statTiles}
${persona}
${busiest}
${streak}
${playfulFootnote(theme, leftX, 970)}
${input.showProjects ? playfulProjectsList(theme, input.topProjects, leftX, 1000) : ''}
</svg>
`;
}

// ---- technical: bespoke card layout (docs/design/wrapped-technical/) ----
//
// Every coordinate below is taken directly from that folder's
// layout-landscape.json / layout-portrait.json, not re-derived. Bespoke
// for the same reason playful's card is: this design (glass stat cards, a
// persona/activity panel pair, a quartile activity grid with a streak
// ring) does not map onto the shared Theme contract technical/mix's HTML
// report and badge still use, and per that folder's own README, only the
// technical theme's Wrapped card changes.

const MONO_ADVANCE = 0.6; // JetBrains Mono: every glyph is exactly 0.6em wide

function monoWidth(text: string, fontSize: number, letterSpacing: number): number {
  if (text.length === 0) return 0;
  return text.length * MONO_ADVANCE * fontSize + (text.length - 1) * letterSpacing;
}

/** docs/design/wrapped-technical/README.md section 9: fit = min(1, maxWidth / textWidth), floor 60% of nominal. Letter spacing scales with the same ratio. */
function fitMono(text: string, maxWidth: number, nominalSize: number, nominalLetterSpacing: number): { fontSize: number; letterSpacing: number } {
  const nominalWidth = monoWidth(text, nominalSize, nominalLetterSpacing);
  const fit = nominalWidth > 0 ? Math.max(0.6, Math.min(1, maxWidth / nominalWidth)) : 1;
  return { fontSize: nominalSize * fit, letterSpacing: nominalLetterSpacing * fit };
}

/** docs/design/wrapped-technical/README.md section 4's baseline formula. */
function monoBaseline(boxTop: number, fontSize: number, lineHeightMultiplier: number): number {
  const lineBox = lineHeightMultiplier * fontSize;
  const content = (1.02 + 0.3) * fontSize;
  return boxTop + (lineBox - content) / 2 + 1.02 * fontSize;
}

/** Compact number format, technical card only: same K/M/B rule as playful's, but drops a trailing ".0" (README section 7: "One decimal, drop a trailing .0"). */
function formatCompactTech(n: number): string {
  const compact = formatCompactNumber(n);
  return compact.replace(/\.0([KMB])$/, '$1');
}

/** README section 7: "$ plus integer with thousands separators; under $10 show two decimals". */
function formatCostTech(costUsd: number | null): string {
  if (costUsd === null) return 'n/a';
  if (Math.abs(costUsd) < 10) return `$${costUsd.toFixed(2)}`;
  return `$${Math.round(costUsd).toLocaleString('en-US')}`;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' -> 'Sep 1'. Deliberately not using Intl/Date-object formatting: the date key is a plain local-calendar string with no timezone attached, and parsing it through `new Date(...)` risks an off-by-one shift depending on the runtime's own timezone. */
function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;
  return `${MONTH_ABBR[month] ?? 'Jan'} ${day}`;
}

/** Longest consecutive run of level >= 1 cells. Mirrors longestStreakDays (computeMetrics) but also returns which cells to ring, which the metric alone does not carry. */
function longestActivityRun(activity: ActivityCell[]): { startIndex: number; endIndex: number; length: number } | null {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < activity.length; i++) {
    if ((activity[i] as ActivityCell).level >= 1) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }
  if (bestLen < 2 || bestStart < 0) return null;
  return { startIndex: bestStart, endIndex: bestStart + bestLen - 1, length: bestLen };
}

function techStatTiles(input: CardInput): StatTile[] {
  const tiles: StatTile[] = [
    { label: 'sessions', value: formatNumber(input.sessions) },
    { label: 'active days', value: formatNumber(input.activeDays) },
  ];
  if (input.showCost !== false) tiles.push({ label: 'est. cost *', value: formatCostTech(input.costUsd) });
  tiles.push(
    { label: 'busiest hour', value: input.busiestHour === null ? 'n/a' : `${String(input.busiestHour).padStart(2, '0')}:00` },
    { label: 'longest streak', value: `${input.longestStreakDays} day${input.longestStreakDays === 1 ? '' : 's'}` },
    { label: 'cache hit', value: `${Math.round((input.cacheHitRate ?? 0) * 100)}%` },
  );
  return tiles;
}

function techGlassCard(x: number, y: number, w: number, h: number, radius: number, gradientId: string): string {
  return `
    <g transform="translate(${x},${y})">
      <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${TECH_CARD.glassTop}"/>
        <stop offset="100%" stop-color="${TECH_CARD.glassBottom}"/>
      </linearGradient></defs>
      <rect width="${w}" height="${h}" rx="${radius}" fill="url(#${gradientId})" stroke="${TECH_CARD.glassBorder}" stroke-width="1"/>
      <line x1="${radius}" y1="0.5" x2="${w - radius}" y2="0.5" stroke="${TECH_CARD.glassHighlight}" stroke-width="1"/>
    </g>`;
}

function techStatGrid(tiles: StatTile[], x: number, y: number, cardW: number, cardH: number, gap: number, labelSize: number, valueSize: number, valueMaxWidth: number, radius: number): string {
  // README section 11 (--no-cost): 5 cards, second row splits its width
  // equally between 2 cards instead of 3. Handled generically: lay out
  // whatever `tiles` contains, 3 per row, and widen the last row's cards
  // to fill the same total width when it has fewer than 3.
  const rows: StatTile[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));

  return rows
    .map((row, rowIdx) => {
      const rowW = cardW * 3 + gap * 2;
      const thisCardW = row.length === 3 ? cardW : (rowW - gap * (row.length - 1)) / row.length;
      return row
        .map((tile, col) => {
          const tx = x + col * (thisCardW + gap);
          const ty = y + rowIdx * (cardH + gap);
          const gradientId = `techGlass${rowIdx}_${col}`;
          const fit = fitMono(tile.value, valueMaxWidth, valueSize, 0);
          const labelY = monoBaseline(0, labelSize, 1.5);
          const valueY = monoBaseline(labelSize * 1.5, fit.fontSize, 1.2);
          return `
        ${techGlassCard(tx, ty, thisCardW, cardH, radius, gradientId)}
        <text x="${tx + 21}" y="${ty + labelY}" font-family="${TECH_CARD.font}" font-size="${labelSize}" fill="${TECH_CARD.muted}">${escapeXml(tile.label)}</text>
        <text x="${tx + 21}" y="${ty + valueY}" font-family="${TECH_CARD.font}" font-size="${fit.fontSize}" font-weight="700" fill="${TECH_CARD.ink}">${escapeXml(tile.value)}</text>`;
        })
        .join('');
    })
    .join('');
}

interface TechPersonaLayout {
  contentX: number;
  labelY: number;
  nameY: number;
  lineY: number;
  labelSize: number;
  nameSize: number;
  lineSize: number;
  nameLetterSpacing: number;
  nameMaxWidth: number;
  lineMaxWidth: number;
  wrap: boolean;
}

function techPersonaPanel(input: CardInput, x: number, y: number, w: number, h: number, radius: number, layout: TechPersonaLayout): string {
  const { contentX, labelY, nameY, lineY, labelSize, nameSize, lineSize, nameLetterSpacing, nameMaxWidth, lineMaxWidth, wrap } = layout;
  const nameFit = fitMono(input.persona.label.toUpperCase(), nameMaxWidth, nameSize, nameLetterSpacing);

  let lineMarkup: string;
  if (wrap) {
    const words = input.persona.line.split(' ');
    const mid = Math.ceil(words.length / 2);
    const line1 = words.slice(0, mid).join(' ');
    const line2 = words.slice(mid).join(' ');
    const y1 = lineY + monoBaseline(0, lineSize, 1.4);
    const y2 = y1 + lineSize * 1.4;
    lineMarkup = `
      <text x="${contentX}" y="${y1}" font-family="${TECH_CARD.font}" font-size="${lineSize}" fill="${TECH_CARD.ink}">${escapeXml(line1)}</text>
      <text x="${contentX}" y="${y2}" font-family="${TECH_CARD.font}" font-size="${lineSize}" fill="${TECH_CARD.ink}">${escapeXml(line2)}</text>`;
  } else {
    const lineFit = fitMono(input.persona.line, lineMaxWidth, lineSize, 0);
    const text = lineFit.fontSize < lineSize ? `${input.persona.line.slice(0, Math.floor((input.persona.line.length * lineFit.fontSize) / lineSize) - 1)}...` : input.persona.line;
    lineMarkup = `<text x="${contentX}" y="${lineY + monoBaseline(0, lineSize, 1.4)}" font-family="${TECH_CARD.font}" font-size="${lineSize}" fill="${TECH_CARD.ink}">${escapeXml(text)}</text>`;
  }

  return `
    <g transform="translate(${x},${y})">
      <rect width="${w}" height="${h}" rx="${radius}" fill="${TECH_CARD.panel}" stroke="${TECH_CARD.panelBorder}" stroke-width="1"/>
      <text x="${contentX}" y="${labelY + monoBaseline(0, labelSize, 1.5)}" font-family="${TECH_CARD.font}" font-size="${labelSize}" fill="${TECH_CARD.muted}">persona</text>
      <text x="${contentX}" y="${nameY + monoBaseline(0, nameFit.fontSize, 1.05)}" font-family="${TECH_CARD.font}" font-size="${nameFit.fontSize}" font-weight="700" letter-spacing="${nameFit.letterSpacing}" fill="${TECH_CARD.accent}">${escapeXml(input.persona.label.toUpperCase())}</text>
      ${lineMarkup}
    </g>`;
}

interface TechActivityLayout {
  contentX: number;
  titleY: number;
  weekdayY: number;
  gridY: number;
  legendY: number;
  streakLegendY: number;
  cellW: number;
  cellH: number;
  cellGap: number;
  cellRadius: number;
  legendSize: number;
  titleSize: number;
  weekdaySize: number;
}

function techActivityPanel(input: CardInput, x: number, y: number, w: number, h: number, radius: number, layout: TechActivityLayout): string {
  const { contentX, titleY, weekdayY, gridY, legendY, streakLegendY, cellW, cellH, cellGap, cellRadius, legendSize, titleSize, weekdaySize } = layout;
  const activity = input.activity;
  const startDate = activity[0]?.date ?? '';
  const endDate = activity[activity.length - 1]?.date ?? '';
  const run = longestActivityRun(activity);

  // Column = day of week, Monday first. The fixed 30-cell window (see the
  // deviation note in docs/notes.md) is padded to whole weeks the same way
  // the reference's own 35-cell grid is: blank leading/trailing cells.
  const firstDow = startDate ? (new Date(`${startDate}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;

  const cells: string[] = [];
  for (let i = 0; i < activity.length; i++) {
    const cell = activity[i] as ActivityCell;
    const gridIndex = firstDow + i;
    const col = gridIndex % 7;
    const row = Math.floor(gridIndex / 7);
    const cx = col * (cellW + cellGap);
    const cy = row * (cellH + cellGap);
    const fill = TECH_CARD.gridLevels[cell.level];
    const ringed = run !== null && i >= run.startIndex && i <= run.endIndex;
    const stroke = ringed ? ` stroke="${TECH_CARD.streakRing}" stroke-width="2"` : '';
    cells.push(`<rect x="${cx}" y="${cy}" width="${cellW}" height="${cellH}" rx="${cellRadius}" fill="${fill}"${stroke}/>`);
  }

  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekdayRow = weekdayLabels
    .map((label, i) => `<text x="${i * (cellW + cellGap) + cellW / 2}" y="${monoBaseline(0, weekdaySize, 1)}" font-family="${TECH_CARD.font}" font-size="${weekdaySize}" fill="${TECH_CARD.muted}" text-anchor="middle">${label}</text>`)
    .join('');

  const legendGap = 6;
  const squaresStartX = monoWidth('less', legendSize, 0) + 10;
  const legendSquares = TECH_CARD.gridLevels
    .map((color, i) => `<rect x="${squaresStartX + i * (legendSize + legendGap)}" width="${legendSize}" height="${legendSize}" rx="${legendSize / 7}" fill="${color}"/>`)
    .join('');
  const moreX = squaresStartX + 5 * (legendSize + legendGap) - legendGap + 10;

  return `
    <g transform="translate(${x},${y})">
      <rect width="${w}" height="${h}" rx="${radius}" fill="${TECH_CARD.panel}" stroke="${TECH_CARD.panelBorder}" stroke-width="1"/>
      <text x="${contentX}" y="${titleY + monoBaseline(0, titleSize, 1.5)}" font-family="${TECH_CARD.font}" font-size="${titleSize}" fill="${TECH_CARD.muted}">activity, last ${activity.length} days</text>
      <text x="${w - contentX}" y="${titleY + monoBaseline(0, titleSize, 1.5)}" font-family="${TECH_CARD.font}" font-size="${titleSize}" fill="${TECH_CARD.muted}" text-anchor="end">${escapeXml(formatShortDate(startDate))} to ${escapeXml(formatShortDate(endDate))}</text>
      <g transform="translate(${contentX},${weekdayY})">${weekdayRow}</g>
      <g transform="translate(${contentX},${gridY})">${cells.join('')}</g>
      <g transform="translate(${contentX},${legendY})">
        <text x="0" y="${legendSize * 0.8}" font-family="${TECH_CARD.font}" font-size="${legendSize}" fill="${TECH_CARD.muted}">less</text>
        ${legendSquares}
        <text x="${moreX}" y="${legendSize * 0.8}" font-family="${TECH_CARD.font}" font-size="${legendSize}" fill="${TECH_CARD.muted}">more</text>
      </g>
      ${
        run
          ? `<g transform="translate(${contentX},${streakLegendY})">
        <rect width="${legendSize}" height="${legendSize}" rx="${legendSize / 7}" fill="${TECH_CARD.gridLevels[2]}" stroke="${TECH_CARD.streakRing}" stroke-width="2"/>
        <text x="${legendSize + 10}" y="${legendSize * 0.8}" font-family="${TECH_CARD.font}" font-size="${legendSize}" fill="${TECH_CARD.muted}">outlined: longest streak, ${input.longestStreakDays} day${input.longestStreakDays === 1 ? '' : 's'}</text>
      </g>`
          : ''
      }
    </g>`;
}

function techNoSessionsCard(input: CardInput, W: number, H: number): string {
  const bg = TECH_CARD.bg;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>
<text x="48" y="${monoBaseline(48, 16, 1.5)}" font-family="${TECH_CARD.font}" font-size="16" letter-spacing="1" fill="${TECH_CARD.ink}"><tspan fill="${TECH_CARD.accent}">$</tspan> npx setup-doctor wrapped</text>
<g transform="translate(${W / 2 - 260},${H / 2 - 60})">
  <rect width="520" height="120" rx="12" fill="${TECH_CARD.panel}" stroke="${TECH_CARD.panelBorder}" stroke-width="1"/>
  <text x="260" y="52" font-family="${TECH_CARD.font}" font-size="20" fill="${TECH_CARD.ink}" text-anchor="middle">No sessions in this period.</text>
  <text x="260" y="82" font-family="${TECH_CARD.font}" font-size="15" fill="${TECH_CARD.muted}" text-anchor="middle">Try --period 90d.</text>
</g>
<text x="48" y="${H - 30}" font-family="${TECH_CARD.font}" font-size="14" fill="${TECH_CARD.muted}">setup-doctor · github.com/saxenakapil/setup-doctor</text>
</svg>
`;
}

function renderTechnicalLandscapeCard(input: CardInput): string {
  if (input.sessions === 0) return techNoSessionsCard(input, 1200, 630);
  const W = 1200;
  const H = 630;
  const leftX = 48;
  const rightX = 752;
  const rightW = 400;

  const heroValue = formatCompactTech(input.totalTokens);
  const heroFit = fitMono(heroValue, 648, 112, -3);
  const subtitle = `last ${input.periodLabel} · ${input.agentLabel}`;

  const statTiles = techStatGrid(techStatTiles(input), leftX, 339.4, 205.3, 95.8, 16, 14, 34, 163.3, 10);
  const persona = techPersonaPanel(input, rightX, 48, rightW, 152, 6, {
    contentX: 25,
    labelY: 23.8,
    nameY: 50.8,
    lineY: 107.2,
    labelSize: 14,
    nameSize: 48,
    lineSize: 15,
    nameLetterSpacing: -1,
    nameMaxWidth: rightW - 2 * 25,
    lineMaxWidth: rightW - 2 * 25,
    wrap: false,
  });
  const activity = techActivityPanel(input, rightX, 220, rightW, 327, 6, {
    contentX: 25,
    titleY: 19,
    weekdayY: 48,
    gridY: 74,
    legendY: 264,
    streakLegendY: 290,
    cellW: 43.1,
    cellH: 30,
    cellGap: 8,
    cellRadius: 4,
    legendSize: 12,
    titleSize: 14,
    weekdaySize: 12,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${TECH_CARD.bg}"/>
<text x="${leftX}" y="${monoBaseline(48, 16, 1.5)}" font-family="${TECH_CARD.font}" font-size="16" fill="${TECH_CARD.ink}"><tspan fill="${TECH_CARD.accent}">$</tspan> npx setup-doctor wrapped</text>
<text x="${leftX}" y="${72 + monoBaseline(0, 15, 1.5)}" font-family="${TECH_CARD.font}" font-size="15" fill="${TECH_CARD.muted}">${escapeXml(subtitle)}</text>
<text x="${leftX}" y="${146.2 + monoBaseline(0, 16, 1.5)}" font-family="${TECH_CARD.font}" font-size="16" fill="${TECH_CARD.muted}">tokens</text>
<text x="${leftX}" y="${170.2 + monoBaseline(0, heroFit.fontSize, 1.05)}" font-family="${TECH_CARD.font}" font-size="${heroFit.fontSize}" font-weight="700" letter-spacing="${heroFit.letterSpacing}" fill="${TECH_CARD.inkStrong}">${escapeXml(heroValue)}</text>
${statTiles}
${persona}
${activity}
<line x1="48" y1="561" x2="1152" y2="561" stroke="none"/>
${input.showCost !== false ? `<text x="48" y="${561 + monoBaseline(0, 14, 1.5)}" font-family="${TECH_CARD.font}" font-size="14" fill="${TECH_CARD.muted}">* API-equivalent estimate, not your bill</text>` : ''}
<text x="1152" y="${561 + monoBaseline(0, 14, 1.5)}" font-family="${TECH_CARD.font}" font-size="14" fill="${TECH_CARD.muted}" text-anchor="end">setup-doctor · github.com/saxenakapil/setup-doctor</text>
</svg>
`;
}

function renderTechnicalPortraitCard(input: CardInput): string {
  if (input.sessions === 0) return techNoSessionsCard(input, 1080, 1350);
  const W = 1080;
  const H = 1350;
  const x = 56;

  const heroValue = formatCompactTech(input.totalTokens);
  const heroFit = fitMono(heroValue, 496, 160, -5);
  const subtitle = `last ${input.periodLabel} · ${input.agentLabel}`;

  const statTiles = techStatGrid(techStatTiles(input), 56, 378.8, 309.3, 131, 20, 18, 50, 258, 12);
  const persona = techPersonaPanel(input, 584, 142.1, 440, 210.7, 8, {
    contentX: 31,
    labelY: 29,
    nameY: 61,
    lineY: 125.7,
    labelSize: 16,
    nameSize: 54,
    lineSize: 20,
    nameLetterSpacing: -1.5,
    nameMaxWidth: 378,
    lineMaxWidth: 378,
    wrap: true,
  });
  const activity = techActivityPanel(input, 56, 686.9, 968, 557, 12, {
    contentX: 41,
    titleY: 37,
    weekdayY: 78,
    gridY: 116,
    legendY: 458,
    streakLegendY: 496,
    cellW: 116.3,
    cellH: 56,
    cellGap: 12,
    cellRadius: 6,
    legendSize: 16,
    titleSize: 18,
    weekdaySize: 16,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${TECH_CARD.bg}"/>
<text x="${x}" y="${56 + monoBaseline(0, 22, 1.5)}" font-family="${TECH_CARD.font}" font-size="22" fill="${TECH_CARD.ink}"><tspan fill="${TECH_CARD.accent}">$</tspan> npx setup-doctor wrapped</text>
<text x="${x}" y="${89 + monoBaseline(0, 18, 1.5)}" font-family="${TECH_CARD.font}" font-size="18" fill="${TECH_CARD.muted}">${escapeXml(subtitle)}</text>
<text x="${x}" y="${148.4 + monoBaseline(0, 20, 1.5)}" font-family="${TECH_CARD.font}" font-size="20" fill="${TECH_CARD.muted}">tokens</text>
<text x="${x}" y="${178.4 + monoBaseline(0, heroFit.fontSize, 1.05)}" font-family="${TECH_CARD.font}" font-size="${heroFit.fontSize}" font-weight="700" letter-spacing="${heroFit.letterSpacing}" fill="${TECH_CARD.inkStrong}">${escapeXml(heroValue)}</text>
${persona}
${statTiles}
${activity}
${input.showCost !== false ? `<text x="${x}" y="${1270 + monoBaseline(0, 16, 1.5)}" font-family="${TECH_CARD.font}" font-size="16" fill="${TECH_CARD.muted}">* API-equivalent estimate, not your bill</text>` : ''}
<text x="${1080 - 56}" y="${1270 + monoBaseline(0, 16, 1.5)}" font-family="${TECH_CARD.font}" font-size="16" fill="${TECH_CARD.muted}" text-anchor="end">github.com/saxenakapil/setup-doctor</text>
</svg>
`;
}

export function renderLandscapeCardSvg(input: CardInput): string {
  if (input.theme.name === 'playful') return renderPlayfulLandscapeCard(input);
  if (input.theme.name === 'technical') return renderTechnicalLandscapeCard(input);
  const { theme } = input;
  const W = 1200;
  const H = 630;
  const rightColW = 340;
  const leftX = 48;
  const rightX = W - rightColW - 48;
  const bg = theme.colors.bg;

  const statsBlock = theme.name === 'technical'
    ? renderStatList(theme, input, leftX, 220)
    : renderStatTiles(theme, buildStatTiles(input), leftX, 190, 220, 110, 16);

  const titleText = `Your last ${input.periodLabel} with ${input.agentLabel}`;
  const titleMaxWidth = rightX - leftX - 24;
  const titleFontSize = fitTitleFontSize(titleText, titleMaxWidth, 46, theme.name === 'technical', 24);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>
<text x="${leftX}" y="56" font-family="${theme.fonts.mono}" font-size="16" letter-spacing="1" fill="${theme.colors.ink}">${escapeXml(eyebrowText(theme, input))}</text>
<text x="${leftX}" y="130" font-family="${theme.fonts.display}" font-size="${titleFontSize}" font-weight="800" fill="${theme.colors.ink}">${escapeXml(titleText)}</text>
${statsBlock}
${renderCostFootnote(theme, leftX, theme.name === 'technical' ? 420 : 340)}
${theme.activityStrip ? renderActivityStrip(theme, input.activity, leftX, theme.name === 'technical' ? 450 : 370, W - rightColW - leftX - 48) : ''}
${input.showProjects ? renderProjectsList(theme, input.topProjects, leftX, theme.name === 'technical' ? 500 : 420) : ''}
${renderPersonaTile(theme, input, rightX, 60, rightColW, 120)}
<g transform="translate(${rightX},200)">
  <rect width="${(rightColW - 12) / 2}" height="80" rx="${theme.radius.card}" fill="${theme.colors.surface}"/>
  <text x="14" y="34" font-family="${theme.fonts.mono}" font-size="11" fill="${theme.colors.muted}">BUSIEST HOUR</text>
  <text x="14" y="60" font-family="${theme.fonts.display}" font-size="20" font-weight="800" fill="${theme.colors.ink}">${input.busiestHour === null ? 'n/a' : `${String(input.busiestHour).padStart(2, '0')}:00`}</text>
</g>
<g transform="translate(${rightX + (rightColW + 12) / 2},200)">
  <rect width="${(rightColW - 12) / 2}" height="80" rx="${theme.radius.card}" fill="${theme.colors.surface}"/>
  <text x="14" y="34" font-family="${theme.fonts.mono}" font-size="11" fill="${theme.colors.muted}">BEST STREAK</text>
  <text x="14" y="60" font-family="${theme.fonts.display}" font-size="20" font-weight="800" fill="${theme.colors.ink}">${input.longestStreakDays}d</text>
</g>
${renderCommandPill(theme, rightX, H - 80)}
</svg>
`;
}

export function renderPortraitCardSvg(input: CardInput): string {
  if (input.theme.name === 'playful') return renderPlayfulPortraitCard(input);
  if (input.theme.name === 'technical') return renderTechnicalPortraitCard(input);
  const { theme } = input;
  const W = 1080;
  const H = 1350;
  const x = 48;
  const bg = theme.colors.bg;

  const statsBlock = theme.name === 'technical'
    ? renderStatList(theme, input, x, 260)
    : renderStatTiles(theme, buildStatTiles(input), x, 230, (W - 2 * x - 16) / 2, 120, 16);

  const titleText = `Your last ${input.periodLabel} with ${input.agentLabel}`;
  const titleMaxWidth = W - 2 * x;
  const titleFontSize = fitTitleFontSize(titleText, titleMaxWidth, 52, theme.name === 'technical', 26);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>
<text x="${x}" y="70" font-family="${theme.fonts.mono}" font-size="18" letter-spacing="1" fill="${theme.colors.ink}">${escapeXml(eyebrowText(theme, input))}</text>
<text x="${x}" y="160" font-family="${theme.fonts.display}" font-size="${titleFontSize}" font-weight="800" fill="${theme.colors.ink}">${escapeXml(titleText)}</text>
${statsBlock}
${renderCostFootnote(theme, x, 516)}
${theme.activityStrip ? renderActivityStrip(theme, input.activity, x, 550, W - 2 * x) : ''}
${input.showProjects ? renderProjectsList(theme, input.topProjects, x, 590) : ''}
${renderPersonaTile(theme, input, x, 780, W - 2 * x, 160)}
<g transform="translate(${x},980)">
  <rect width="${(W - 2 * x - 16) / 2}" height="100" rx="${theme.radius.card}" fill="${theme.colors.surface}"/>
  <text x="16" y="40" font-family="${theme.fonts.mono}" font-size="13" fill="${theme.colors.muted}">BUSIEST HOUR</text>
  <text x="16" y="74" font-family="${theme.fonts.display}" font-size="26" font-weight="800" fill="${theme.colors.ink}">${input.busiestHour === null ? 'n/a' : `${String(input.busiestHour).padStart(2, '0')}:00`}</text>
</g>
<g transform="translate(${x + (W - 2 * x + 16) / 2},980)">
  <rect width="${(W - 2 * x - 16) / 2}" height="100" rx="${theme.radius.card}" fill="${theme.colors.surface}"/>
  <text x="16" y="40" font-family="${theme.fonts.mono}" font-size="13" fill="${theme.colors.muted}">BEST STREAK</text>
  <text x="16" y="74" font-family="${theme.fonts.display}" font-size="26" font-weight="800" fill="${theme.colors.ink}">${input.longestStreakDays}d</text>
</g>
${renderCommandPill(theme, x, H - 100)}
</svg>
`;
}
