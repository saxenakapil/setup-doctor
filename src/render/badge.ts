// Badge SVG (drawn locally, no remote font) and the shields.io endpoint
// JSON / markdown snippet. See docs/scope.md section 12.2 and docs/themes.md
// section 6.

import { getTheme } from './themes/index.js';
import type { ThemeName } from './themes/index.js';

const BAND_COLORS: Record<string, string> = {
  Excellent: '#3DDC84',
  Good: '#B5D33D',
  'Needs work': '#FFB347',
  Poor: '#FF6B6B',
};

export const SHIELDS_COLOR_NAMES: Record<string, string> = {
  Excellent: 'brightgreen',
  Good: 'yellowgreen',
  'Needs work': 'orange',
  Poor: 'red',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rough estimate for an 11px sans-serif label. Good enough for a local,
// non-pixel-perfect badge; there is no network font metrics service to ask.
function estimateTextWidth(text: string): number {
  return Math.round(text.length * 6.5) + 20;
}

export interface BadgeSvgInput {
  score: number;
  band: string;
  theme: ThemeName;
}

export function renderBadgeSvg(input: BadgeSvgInput): string {
  const theme = getTheme(input.theme);
  const label = 'setup doctor';
  const message = `${input.score} ${input.band}`;
  const leftWidth = estimateTextWidth(label);
  const rightWidth = estimateTextWidth(message);
  const totalWidth = leftWidth + rightWidth;
  const height = 20;
  const rightColor = BAND_COLORS[input.band] ?? '#8A9BAE';
  const leftBg = theme.colors.track;
  const leftTextColor = theme.name === 'playful' ? '#0B0F14' : theme.colors.ink;
  const rightTextColor = '#0B0F14';
  const ariaLabel = `${label}: ${message}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${escapeXml(ariaLabel)}">
  <title>${escapeXml(ariaLabel)}</title>
  <rect width="${leftWidth}" height="${height}" fill="${leftBg}"/>
  <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="${rightColor}"/>
  <g font-family="Verdana, Geneva, sans-serif" font-size="11">
    <text x="${leftWidth / 2}" y="14" fill="${leftTextColor}" text-anchor="middle">${escapeXml(label)}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14" fill="${rightTextColor}" text-anchor="middle">${escapeXml(message)}</text>
  </g>
</svg>
`;
}

export interface EndpointBadgeJson {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

export function renderEndpointBadgeJson(score: number, band: string): EndpointBadgeJson {
  return {
    schemaVersion: 1,
    label: 'setup doctor',
    message: `${score} ${band}`,
    color: SHIELDS_COLOR_NAMES[band] ?? 'lightgrey',
  };
}

export function renderMarkdownSnippet(score: number, band: string): string {
  const label = 'setup%20doctor';
  const message = encodeURIComponent(`${score} ${band}`);
  const color = SHIELDS_COLOR_NAMES[band] ?? 'lightgrey';
  const url = `https://img.shields.io/badge/${label}-${message}-${color}`;
  return `![Setup Doctor score](${url})`;
}
