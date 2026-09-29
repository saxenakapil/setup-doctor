import { BODY_FALLBACK, DISPLAY_FALLBACK, type Theme } from './types.js';

// docs/themes.md section 2.1. Real font files are not bundled yet (see
// docs/notes.md); font-family stacks lead with the intended family name so
// they activate automatically once real @font-face rules are added.
export const playful: Theme = {
  name: 'playful',
  colors: {
    bg: '#FFF4E0',
    surface: '#FFFDF7',
    ink: '#1A1A1A',
    muted: '#4A4A4A',
    accent: '#FF5A3C',
    accent2: '#FFD447',
    good: '#3DDC84',
    warn: '#FFD447',
    bad: '#FF5A3C',
    link: '#1A1A1A',
    track: '#FFE3B3',
  },
  border: '3px solid #1A1A1A',
  cardBorder: '2px solid #1A1A1A',
  radius: { panel: 28, card: 18, pill: 999 },
  shadow: '8px 8px 0 #1A1A1A',
  fonts: {
    display: `'Bricolage Grotesque', ${DISPLAY_FALLBACK}`,
    body: `'Figtree', ${BODY_FALLBACK}`,
    mono: BODY_FALLBACK,
  },
  hardShadow: true,
  barStyle: 'rounded',
  persona: 'tilted',
  activityStrip: false,
};
