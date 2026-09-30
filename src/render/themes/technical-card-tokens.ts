// Design tokens for the technical theme's Wrapped card, specifically.
// Source of truth: docs/design/wrapped-technical/ (a frozen reference,
// like docs/scope.md/docs/rules.md; see that folder's own README section
// 0 for precedence and section 2 for the rules this file follows). Not
// part of the shared Theme contract in ./types.ts: this card's design
// (glass stat cards, a persona/activity panel pair, a quartile activity
// grid with a streak ring) does not map onto that generic token set, and
// the HTML report and badge for the technical theme are unaffected by
// this file (they still use ./technical.ts).

export const TECH_CARD = {
  bg: '#0B0F14',
  ink: '#D6DEE7',
  inkStrong: '#F0F4F8',
  muted: '#8A9BAE',
  accent: '#3DDC84',
  panel: '#111820',
  panelBorder: '#223041',
  glassBorder: 'rgba(255,255,255,0.09)',
  glassHighlight: 'rgba(255,255,255,0.06)',
  glassTop: 'rgba(255,255,255,0.05)',
  glassBottom: 'rgba(255,255,255,0.02)',
  gridLevels: ['#161E27', '#12331F', '#1D6B3A', '#2FA85B', '#3DDC84'] as const,
  streakRing: '#F0F4F8',
  font: "'JetBrains Mono', ui-monospace,'SF Mono',Menlo,Consolas,monospace",
} as const;
