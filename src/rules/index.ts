// Rule registry. Adding a rule touches one new file plus one line here.

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
import { skl06 } from './skl-06.js';
import { mcp01 } from './mcp-01.js';
import { mcp02 } from './mcp-02.js';
import { mcp03 } from './mcp-03.js';
import { mcp04 } from './mcp-04.js';
import { mcp05 } from './mcp-05.js';
import { plg01 } from './plg-01.js';
import { plg02 } from './plg-02.js';
import { plg03 } from './plg-03.js';
import { set01 } from './set-01.js';
import { set02 } from './set-02.js';
import { set03 } from './set-03.js';
import { set04 } from './set-04.js';
import { set05 } from './set-05.js';
import { frs01 } from './frs-01.js';
import { frs02 } from './frs-02.js';
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
  skl06,
  mcp01,
  mcp02,
  mcp03,
  mcp04,
  mcp05,
  plg01,
  plg02,
  plg03,
  set01,
  set02,
  set03,
  set04,
  set05,
  frs01,
  frs02,
];

export function getRule(id: string): Rule | undefined {
  return ALL_RULES.find((r) => r.id.toLowerCase() === id.toLowerCase());
}
