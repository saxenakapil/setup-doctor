import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildModel, detectAgents, makeDiscoveryContext, runDoctor } from '../../src/core/runner.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'adapter-claude');

describe('runner', () => {
  it('detects claude and builds a normalized model from the typical fixture', async () => {
    const ctx = makeDiscoveryContext({
      path: join(FIXTURES, 'typical', 'project'),
      homeDir: join(FIXTURES, 'typical', 'home'),
    });
    const agents = await detectAgents(ctx, 'auto');
    expect(agents).toEqual(['claude']);

    const model = await buildModel(ctx, agents);
    expect(model.instructions.length).toBeGreaterThan(0);
    expect(model.skills.length).toBeGreaterThan(0);
    expect(model.mcpServers.length).toBe(1);
    expect(model.plugins.length).toBe(1);
    expect(model.hooks.length).toBe(1);
    expect(model.permissions.length).toBe(2);
  });

  it('runDoctor produces a findings skeleton with no findings yet', async () => {
    const report = await runDoctor({
      path: join(FIXTURES, 'typical', 'project'),
      homeDir: join(FIXTURES, 'typical', 'home'),
    });
    expect(report.agentsDetected).toEqual(['claude']);
    expect(report.findings).toEqual([]);
    expect(report.toolVersion).toBeTruthy();
    expect(report.rulesVersion).toBe('1.0.0');
  });
});
