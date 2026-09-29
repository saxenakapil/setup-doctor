// A hand-written TOML subset reader: tables (including dotted and quoted
// segments) and key = value pairs (strings, booleans, numbers, inline
// arrays, possibly spanning multiple lines). No dependency, matching
// docs/scope.md section 4 ("a minimal TOML reader for tables and key-value
// pairs"). Verified against a real Codex ~/.codex/config.toml on 2026-09-29
// (dotted/quoted table headers like `[mcp_servers.node_repl.env]` and
// `[projects."/Users/kapil/Documents/CHAP"]` are real, observed shapes).
//
// Not a general TOML parser: no multi-line strings, no inline tables
// (`{ a = 1 }`), no date/time literals (parsed as strings). Unsupported
// constructs are skipped rather than throwing, per the "never crash on
// unexpected input" hard rule.

export type TomlValue = string | number | boolean | TomlValue[];
export type TomlTable = { [key: string]: TomlValue | TomlTable };

export interface TomlParseResult {
  ok: boolean;
  data: TomlTable;
  error?: string;
}

function splitTableHeader(header: string): string[] | null {
  const segments: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < header.length; i++) {
    const ch = header[i] as string;
    if (inQuotes) {
      if (ch === quoteChar) {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuotes = true;
      quoteChar = ch;
      continue;
    }
    if (ch === '.') {
      segments.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current.trim());
  if (inQuotes) return null;
  return segments.filter((s) => s.length > 0);
}

function parseScalar(raw: string): TomlValue {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

function parseArrayItems(inner: string): TomlValue[] {
  const items: TomlValue[] = [];
  let depth = 0;
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string;
    if (inQuotes) {
      current += ch;
      if (ch === quoteChar && inner[i - 1] !== '\\') inQuotes = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuotes = true;
      quoteChar = ch;
      current += ch;
      continue;
    }
    if (ch === '[') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ']') {
      depth--;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      if (current.trim()) items.push(parseValue(current));
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(parseValue(current));
  return items;
}

function parseValue(raw: string): TomlValue {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    return parseArrayItems(s.slice(1, -1));
  }
  return parseScalar(s);
}

function getOrCreateTable(root: TomlTable, path: string[]): TomlTable {
  let node = root;
  for (const segment of path) {
    const existing = node[segment];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      node = existing as TomlTable;
    } else {
      const created: TomlTable = {};
      node[segment] = created;
      node = created;
    }
  }
  return node;
}

function stripComment(line: string): string {
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuotes) {
      if (ch === quoteChar && line[i - 1] !== '\\') inQuotes = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuotes = true;
      quoteChar = ch;
      continue;
    }
    if (ch === '#') return line.slice(0, i);
  }
  return line;
}

export function parseToml(text: string): TomlParseResult {
  const root: TomlTable = {};
  const rawLines = text.split(/\r\n|\n/);
  let current = root;
  let pendingKey: string | null = null;
  let pendingValue = '';
  let bracketDepth = 0;

  for (let rawLine of rawLines) {
    let line = stripComment(rawLine);

    if (pendingKey !== null) {
      pendingValue += `\n${line}`;
      bracketDepth += (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
      if (bracketDepth <= 0) {
        current[pendingKey] = parseValue(pendingValue);
        pendingKey = null;
        pendingValue = '';
      }
      continue;
    }

    line = line.trim();
    if (!line) continue;

    if (line.startsWith('[[') && line.endsWith(']]')) {
      // Array-of-tables: not needed for MCP server discovery; skip safely.
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const segments = splitTableHeader(line.slice(1, -1));
      if (!segments) continue;
      current = getOrCreateTable(root, segments);
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    const valueRaw = line.slice(eq + 1);
    const openBrackets = (valueRaw.match(/\[/g) ?? []).length;
    const closeBrackets = (valueRaw.match(/\]/g) ?? []).length;
    if (openBrackets > closeBrackets) {
      pendingKey = key;
      pendingValue = valueRaw;
      bracketDepth = openBrackets - closeBrackets;
      continue;
    }
    current[key] = parseValue(valueRaw);
  }

  return { ok: true, data: root };
}
