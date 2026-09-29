// A hand-written YAML subset parser for SKILL.md / subagent frontmatter:
// key: value pairs, quoted strings, plain scalars, and block scalars > and |.
// See docs/rules.md SKL-01 and docs/scope.md section 4.

export interface FrontmatterResult {
  ok: boolean;
  data: Record<string, string>;
  error?: 'no frontmatter' | 'frontmatter not closed';
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseFrontmatter(text: string): FrontmatterResult {
  const lines = text.split(/\r\n|\n/);
  if ((lines[0] ?? '').trim() !== '---') {
    return { ok: false, data: {}, error: 'no frontmatter' };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    return { ok: false, data: {}, error: 'frontmatter not closed' };
  }

  const body = lines.slice(1, closingIndex);
  const data: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const line = body[i] ?? '';
    if (!line.trim()) {
      i++;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1] as string;
    let value = (m[2] ?? '').trim();

    if (value === '>' || value === '|') {
      const folded = value === '>';
      const blockLines: string[] = [];
      i++;
      let baseIndent: number | null = null;
      while (i < body.length) {
        const l = body[i] ?? '';
        if (l.trim() === '') {
          blockLines.push('');
          i++;
          continue;
        }
        const indent = (/^(\s*)/.exec(l)?.[1] ?? '').length;
        if (baseIndent === null) {
          if (indent === 0) break; // next top-level key, block was empty
          baseIndent = indent;
        }
        if (indent < baseIndent) break;
        blockLines.push(l.slice(baseIndent));
        i++;
      }
      while (blockLines.length > 0 && blockLines[blockLines.length - 1] === '') blockLines.pop();
      data[key] = folded ? blockLines.join(' ').trim() : blockLines.join('\n');
      continue;
    }

    data[key] = stripQuotes(value);
    i++;
  }

  return { ok: true, data };
}
