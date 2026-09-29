// Wrapped card SVG (both sizes, all three themes). See docs/scope.md
// section 12.3 and docs/themes.md section 4. PNG export is handled by the
// caller via the optional @resvg/resvg-js dependency (scope.md section 4).

import { embeddedFontFaceCss } from './fonts.js';
import type { Theme } from './themes/index.js';
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

export interface CardInput {
  theme: Theme;
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
        `<text x="${x}" y="${y + i * 20}" font-family="${theme.fonts.mono}" font-size="12" fill="${theme.colors.muted}">${escapeXml(p.project)} — ${formatNumber(p.tokens)} tok</text>`,
    )
    .join('');
}

function eyebrowText(theme: Theme, input: CardInput): string {
  return theme.name === 'playful'
    ? 'Setup Doctor · Wrapped'
    : `$ npx setup-doctor wrapped --period ${input.periodLabel}`;
}

export function renderLandscapeCardSvg(input: CardInput): string {
  const { theme } = input;
  const W = 1200;
  const H = 630;
  const rightColW = 340;
  const leftX = 48;
  const rightX = W - rightColW - 48;
  const bg = theme.name === 'playful' ? theme.colors.accent : theme.colors.bg;

  const statsBlock = theme.name === 'technical'
    ? renderStatList(theme, input, leftX, 220)
    : renderStatTiles(theme, buildStatTiles(input), leftX, 190, 220, 110, 16);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>
<text x="${leftX}" y="56" font-family="${theme.fonts.mono}" font-size="16" letter-spacing="1" fill="${theme.colors.ink}">${escapeXml(eyebrowText(theme, input))}</text>
<text x="${leftX}" y="130" font-family="${theme.fonts.display}" font-size="46" font-weight="800" fill="${theme.colors.ink}">${escapeXml(`Your last ${input.periodLabel} with Claude Code`)}</text>
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
  const { theme } = input;
  const W = 1080;
  const H = 1350;
  const x = 48;
  const bg = theme.name === 'playful' ? theme.colors.accent : theme.colors.bg;

  const statsBlock = theme.name === 'technical'
    ? renderStatList(theme, input, x, 260)
    : renderStatTiles(theme, buildStatTiles(input), x, 230, (W - 2 * x - 16) / 2, 120, 16);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
${renderTitleDesc(input)}
<style>${embeddedFontFaceCss()}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>
<text x="${x}" y="70" font-family="${theme.fonts.mono}" font-size="18" letter-spacing="1" fill="${theme.colors.ink}">${escapeXml(eyebrowText(theme, input))}</text>
<text x="${x}" y="160" font-family="${theme.fonts.display}" font-size="52" font-weight="800" fill="${theme.colors.ink}">${escapeXml(`Your last ${input.periodLabel} with Claude Code`)}</text>
${statsBlock}
${renderCostFootnote(theme, x, 490)}
${theme.activityStrip ? renderActivityStrip(theme, input.activity, x, 530, W - 2 * x) : ''}
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
