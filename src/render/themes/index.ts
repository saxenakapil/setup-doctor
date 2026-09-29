// See docs/themes.md section 7.

import { playful } from './playful.js';
import { technical } from './technical.js';
import { mix } from './mix.js';
import type { Theme, ThemeName } from './types.js';

export type { Theme, ThemeName } from './types.js';

const THEMES: Record<ThemeName, Theme> = { playful, technical, mix };

export const THEME_NAMES: ThemeName[] = ['playful', 'technical', 'mix'];

export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as string[]).includes(value);
}

export function getTheme(name: ThemeName): Theme {
  return THEMES[name];
}
