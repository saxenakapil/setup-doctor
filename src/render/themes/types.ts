// Theme token contract. See docs/themes.md sections 2 and 7.
// A fourth theme is addable by adding one file here plus a case in index.ts.

export type ThemeName = 'playful' | 'technical' | 'mix';

export interface ThemeColors {
  bg: string;
  surface: string; // "surface" in playful, "panel" in technical/mix
  ink: string;
  muted: string;
  accent: string; // primary accent: bars/HIGH tag
  accent2: string; // secondary accent: MED tag
  good: string;
  warn: string;
  bad: string;
  link: string;
  track: string;
}

export interface ThemeRadius {
  panel: number;
  card: number;
  pill: number;
}

export interface ThemeFonts {
  display: string; // CSS font-family value, fallback stack included
  body: string;
  mono: string;
}

export interface Theme {
  name: ThemeName;
  colors: ThemeColors;
  border: string; // CSS border shorthand for panels
  cardBorder: string;
  radius: ThemeRadius;
  shadow: string; // CSS box-shadow value, or 'none'
  fonts: ThemeFonts;
  hardShadow: boolean;
  barStyle: 'rounded' | 'blocks';
  persona: 'tilted' | 'panel';
  activityStrip: boolean;
}

// docs/themes.md fallback stacks (section 5): used verbatim since no real
// WOFF2 files are bundled yet (see docs/notes.md).
export const DISPLAY_FALLBACK = "'Arial Black', 'Helvetica Neue', system-ui, sans-serif";
export const BODY_FALLBACK = "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO_FALLBACK = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
