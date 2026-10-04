// Adapter registry.

import type { Adapter, Agent } from '../core/types.js';
import { claudeCodeAdapter } from './claude-code.js';
import { codexAdapter } from './codex.js';
import { cursorAdapter } from './cursor.js';
import { copilotAdapter } from './copilot.js';
import { genericAdapter } from './generic.js';

const ADAPTERS: Partial<Record<Agent, Adapter>> = {
  claude: claudeCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  copilot: copilotAdapter,
  generic: genericAdapter,
};

export function getAdapter(agent: Agent): Adapter | undefined {
  return ADAPTERS[agent];
}

export function knownAgents(): Agent[] {
  return Object.keys(ADAPTERS) as Agent[];
}
