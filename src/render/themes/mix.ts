import { MONO_FALLBACK, DISPLAY_FALLBACK, type Theme } from './types.js';

// docs/themes.md section 2.3.
export const mix: Theme = {
  name: 'mix',
  colors: {
    bg: '#0B0F14',
    surface: '#111820',
    ink: '#F3EEE3',
    muted: '#8A9BAE',
    accent: '#FF6B4A',
    accent2: '#FFD447',
    good: '#3DDC84',
    warn: '#FFD447',
    bad: '#FF6B4A',
    link: '#7AB8FF',
    track: '#1B2530',
  },
  border: '2px solid #223041',
  cardBorder: '2px solid #223041',
  radius: { panel: 16, card: 12, pill: 999 },
  shadow: '8px 8px 0 #FF6B4A',
  fonts: {
    display: `'Bricolage Grotesque', ${DISPLAY_FALLBACK}`,
    body: `'JetBrains Mono', ${MONO_FALLBACK}`,
    mono: `'JetBrains Mono', ${MONO_FALLBACK}`,
  },
  hardShadow: true,
  barStyle: 'blocks',
  persona: 'tilted',
  activityStrip: true,
};
