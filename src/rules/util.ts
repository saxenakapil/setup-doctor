// Shared helpers for instruction-file rules. Not a rule itself.
// See docs/rules.md "Conventions": headings and fenced code blocks are
// ignored by text rules unless a rule says otherwise.

import { normalizeLine } from '../core/text.js';
import type { Agent, InstructionFile, Scope } from '../core/types.js';

export interface TextLine {
  file: string;
  agent: Agent;
  scope: Scope;
  lineNumber: number;
  raw: string;
  normalized: string;
}

export function collectTextLines(file: InstructionFile): TextLine[] {
  const out: TextLine[] = [];
  let inCodeBlock = false;
  file.lines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) return;
    if (/^#{1,6}\s/.test(trimmed)) return;
    if (!trimmed) return;
    out.push({
      file: file.path,
      agent: file.agent,
      scope: file.scope,
      lineNumber: idx + 1,
      raw,
      normalized: normalizeLine(raw),
    });
  });
  return out;
}
