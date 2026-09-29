// Text normalization, similarity and secret-detection helpers shared by rules
// and adapters. See docs/rules.md "Conventions" and INS-08 / MCP-03.

import { SECRET_ENTROPY_THRESHOLD } from './defaults.js';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'be', 'it', 'this', 'that', 'as', 'at', 'by', 'from',
]);

/**
 * Lowercases, trims, strips a leading list marker (-, *, +, "1."), strips
 * surrounding markdown emphasis, and collapses whitespace.
 */
export function normalizeLine(input: string): string {
  let s = input.trim();
  s = s.replace(/^(?:[-*+]|\d+\.)\s+/, '');
  s = s.toLowerCase();
  const emphasisMatch = /^([*_`]{1,3})(.*)\1$/.exec(s);
  if (emphasisMatch && emphasisMatch[2]) s = emphasisMatch[2];
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Split on non-letters/digits, lowercase, drop stopwords and short tokens. */
export function wordSet(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function wordBigrams(normalized: string): string[] {
  const words = normalized.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    out.push(`${words[i]} ${words[i + 1]}`);
  }
  return out;
}

/** Dice coefficient over word bigrams of two already-normalized lines. */
export function dice(normalizedA: string, normalizedB: string): number {
  const a = wordBigrams(normalizedA);
  const b = wordBigrams(normalizedB);
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 1 : 0;
  const remaining = new Map<string, number>();
  for (const bg of b) remaining.set(bg, (remaining.get(bg) ?? 0) + 1);
  let matches = 0;
  for (const bg of a) {
    const count = remaining.get(bg) ?? 0;
    if (count > 0) {
      matches++;
      remaining.set(bg, count - 1);
    }
  }
  return (2 * matches) / (a.length + b.length);
}

export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function looksLikePlaceholder(value: string): boolean {
  if (/your|example|xxxx|changeme|<|>|\$\{/i.test(value)) return true;
  if (/^(.)\1*$/.test(value)) return true;
  return false;
}

export interface SecretMatch {
  kind: string;
}

const SECRET_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'generic-sk-key', re: /sk-[A-Za-z0-9_-]{20,}/ },
  { kind: 'github-token', re: /ghp_[A-Za-z0-9]{36}/ },
  { kind: 'github-pat', re: /github_pat_[A-Za-z0-9_]{50,}/ },
  { kind: 'aws-key-id', re: /AKIA[0-9A-Z]{16}/ },
  { kind: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { kind: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
];

const ASSIGNMENT_RE = /(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"]?([A-Za-z0-9_\-/+=]{16,})/i;

/** Never returns the matched text, only a kind label. Shared by INS-08 and MCP-03. */
export function findSecretLikeValues(line: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    if (re.test(line)) matches.push({ kind });
  }
  const assignment = ASSIGNMENT_RE.exec(line);
  if (assignment) {
    const value = assignment[2] ?? '';
    if (!looksLikePlaceholder(value) && shannonEntropy(value) >= SECRET_ENTROPY_THRESHOLD) {
      matches.push({ kind: 'assignment' });
    }
  }
  return matches;
}

const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const KNOWN_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|json|md|py|go|rs|java|yml|yaml|toml|sh)$/i;

function isCandidateRelativePath(token: string): boolean {
  if (!token) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) return false; // any URL scheme
  if (token.startsWith('#')) return false;
  if (token.startsWith('/') || token.startsWith('~')) return false;
  if (/^[A-Za-z]:[\\/]/.test(token)) return false;
  if (token.includes('*') || token.includes('<') || token.includes('{')) return false;
  if (/\s/.test(token)) return false;
  return token.includes('/') || KNOWN_EXTENSIONS.test(token);
}

export interface TextRelativeRef {
  target: string;
  line: number;
}

/**
 * Extracts relative-looking references from markdown links and inline code
 * spans: used by adapters to fill Skill.relativeRefs (SKL-05) and by INS-06.
 */
export function extractRelativeRefs(text: string): TextRelativeRef[] {
  const lines = text.split('\n');
  const refs: TextRelativeRef[] = [];
  lines.forEach((line, idx) => {
    let m: RegExpExecArray | null;
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(line))) {
      const raw = (m[1] ?? '').trim();
      const target = raw.split(/\s+/)[0] ?? '';
      if (isCandidateRelativePath(target)) refs.push({ target, line: idx + 1 });
    }
    INLINE_CODE_RE.lastIndex = 0;
    while ((m = INLINE_CODE_RE.exec(line))) {
      const target = (m[1] ?? '').trim();
      if (isCandidateRelativePath(target)) refs.push({ target, line: idx + 1 });
    }
  });
  return refs;
}

/** Inline-code (backtick) spans only, for INS-06. No markdown links. */
export function extractInlineCodePaths(text: string): TextRelativeRef[] {
  const lines = text.split('\n');
  const refs: TextRelativeRef[] = [];
  lines.forEach((line, idx) => {
    INLINE_CODE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_CODE_RE.exec(line))) {
      const target = (m[1] ?? '').trim();
      if (isCandidateRelativePath(target)) refs.push({ target, line: idx + 1 });
    }
  });
  return refs;
}

const SCRIPT_COMMAND_RE = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([A-Za-z0-9_:-]+)/g;

/** `npm run <script>`, `pnpm <script>`, `yarn <script>` style commands, for INS-06. */
export function extractScriptCommands(text: string): TextRelativeRef[] {
  const lines = text.split('\n');
  const refs: TextRelativeRef[] = [];
  lines.forEach((line, idx) => {
    SCRIPT_COMMAND_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SCRIPT_COMMAND_RE.exec(line))) {
      const script = m[1];
      if (script && script !== 'run') refs.push({ target: script, line: idx + 1 });
    }
  });
  return refs;
}
