// Adapter registry. Codex and Cursor adapters land in Phase 6.

import type { Adapter, Agent } from '../core/types.js';
import { claudeCodeAdapter } from './claude-code.js';

const ADAPTERS: Partial<Record<Agent, Adapter>> = {
  claude: claudeCodeAdapter,
};

export function getAdapter(agent: Agent): Adapter | undefined {
  return ADAPTERS[agent];
}

export function knownAgents(): Agent[] {
  return Object.keys(ADAPTERS) as Agent[];
}
