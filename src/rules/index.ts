// Rule registry. Adding a rule touches one new file plus one line here.
// SKL-06, MCP-01..05, PLG-01..03, SET-01/02, FRS-01/02 land in Phase 3 and 5.

import { ins01 } from './ins-01.js';
import { ins02 } from './ins-02.js';
import { ins03 } from './ins-03.js';
import { ins04 } from './ins-04.js';
import { ins05 } from './ins-05.js';
import { ins06 } from './ins-06.js';
import { ins07 } from './ins-07.js';
import { ins08 } from './ins-08.js';
import { skl01 } from './skl-01.js';
import { skl02 } from './skl-02.js';
import { skl03 } from './skl-03.js';
import { skl04 } from './skl-04.js';
import { skl05 } from './skl-05.js';
import type { Rule } from '../core/types.js';

export const ALL_RULES: Rule[] = [
  ins01,
  ins02,
  ins03,
  ins04,
  ins05,
  ins06,
  ins07,
  ins08,
  skl01,
  skl02,
  skl03,
  skl04,
  skl05,
];

export function getRule(id: string): Rule | undefined {
  return ALL_RULES.find((r) => r.id.toLowerCase() === id.toLowerCase());
}
