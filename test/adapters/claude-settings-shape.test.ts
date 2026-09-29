import { describe, expect, it } from 'vitest';
import { removeHookFromSettingsJson } from '../../src/adapters/claude-settings-shape.js';

describe('removeHookFromSettingsJson', () => {
  it('removes one hook, leaves a sibling hook in the same array untouched, valid JSON result', () => {
    const raw = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/missing.sh"
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write ."
          }
        ]
      }
    ]
  }
}
`;
    const after = removeHookFromSettingsJson(raw, 'PreToolUse', './scripts/missing.sh');
    expect(after).not.toBeNull();
    const parsed = JSON.parse(after as string);
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('Edit');
    // Real, valid JSON: re-parsing and re-serializing must be idempotent (no dangling comma, no syntax error already ruled out by JSON.parse above).
    expect(() => JSON.parse(after as string)).not.toThrow();
  });

  it('removes the whole event key when it becomes empty, and the whole "hooks" key when nothing is left', () => {
    const raw = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/missing.sh"
          }
        ]
      }
    ]
  }
}
`;
    const after = removeHookFromSettingsJson(raw, 'PreToolUse', './scripts/missing.sh');
    const parsed = JSON.parse(after as string);
    expect(parsed.hooks).toBeUndefined();
  });

  it('preserves sibling top-level keys (e.g. permissions) untouched', () => {
    const raw = `{
  "permissions": {
    "allow": [
      "Bash(npm test:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/missing.sh"
          }
        ]
      }
    ]
  }
}
`;
    const after = removeHookFromSettingsJson(raw, 'PreToolUse', './scripts/missing.sh');
    const parsed = JSON.parse(after as string);
    expect(parsed.permissions.allow).toEqual(['Bash(npm test:*)']);
  });

  it('handles the shorthand group shape ({"matcher", "command"} with no nested "hooks" array)', () => {
    const raw = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "./scripts/missing.sh"
      }
    ]
  }
}
`;
    const after = removeHookFromSettingsJson(raw, 'PreToolUse', './scripts/missing.sh');
    const parsed = JSON.parse(after as string);
    expect(parsed.hooks).toBeUndefined();
  });

  it('returns null when the hook is not found', () => {
    const raw = `{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"./ok.sh"}]}]}}`;
    expect(removeHookFromSettingsJson(raw, 'PreToolUse', './does-not-exist.sh')).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    expect(removeHookFromSettingsJson('{ not json', 'PreToolUse', './x.sh')).toBeNull();
  });

  it('returns null (refuses to guess) when the file\'s own formatting cannot be reproduced exactly', () => {
    // Inconsistent/unusual indentation (3 spaces) that no candidate indent width reproduces.
    const raw = `{\n   "hooks": {\n      "PreToolUse": [\n         {"matcher": "Bash", "hooks": [{"type": "command", "command": "./scripts/missing.sh"}]}\n      ]\n   }\n}\n`;
    expect(removeHookFromSettingsJson(raw, 'PreToolUse', './scripts/missing.sh')).toBeNull();
  });

  it('reproduces a real 4-space-indented file correctly', () => {
    const raw = `{\n    "hooks": {\n        "PreToolUse": [\n            {\n                "matcher": "Bash",\n                "hooks": [\n                    {\n                        "type": "command",\n                        "command": "./scripts/missing.sh"\n                    }\n                ]\n            }\n        ]\n    }\n}\n`;
    const after = removeHookFromSettingsJson(raw, 'PreToolUse', './scripts/missing.sh');
    expect(after).not.toBeNull();
    expect(JSON.parse(after as string).hooks).toBeUndefined();
  });
});
