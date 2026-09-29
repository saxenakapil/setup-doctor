import { MONO_FALLBACK, type Theme } from './types.js';

// docs/themes.md section 2.2.
export const technical: Theme = {
  name: 'technical',
  colors: {
    bg: '#0B0F14',
    surface: '#111820',
    ink: '#D6DEE7',
    muted: '#8A9BAE',
    accent: '#FF6B6B',
    accent2: '#F2B84B',
    good: '#3DDC84',
    warn: '#F2B84B',
    bad: '#FF6B6B',
    link: '#7AB8FF',
    track: '#2A3644',
  },
  border: '1px solid #223041',
  cardBorder: '1px solid #223041',
  radius: { panel: 6, card: 6, pill: 6 },
  shadow: 'none',
  fonts: {
    display: `'JetBrains Mono', ${MONO_FALLBACK}`,
    body: `'JetBrains Mono', ${MONO_FALLBACK}`,
    mono: `'JetBrains Mono', ${MONO_FALLBACK}`,
  },
  hardShadow: false,
  barStyle: 'blocks',
  persona: 'panel',
  activityStrip: true,
};
