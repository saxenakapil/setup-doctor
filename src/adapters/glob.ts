// Minimal glob matcher for .setupdoctorrc's `ignore` field. Deliberately
// not a full .gitignore implementation (no negation, no implicit
// any-depth matching for a slash-free pattern): patterns are matched
// against a path already relative to the project root, anchored at the
// start unless the pattern itself begins with "**/". Supported syntax:
//   *    any characters within one path segment (no "/")
//   **   any number of path segments, including zero
//   ?    a single character within one path segment
// A trailing "/" is shorthand for "everything under this directory"
// (equivalent to appending "**").

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.endsWith('/') ? `${pattern}**` : pattern;
  let out = '';
  let i = 0;
  while (i < normalized.length) {
    const c = normalized[i];
    if (c === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
    } else if (c === '*') {
      out += '[^/]*';
      i += 1;
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if ('.+^${}()|[]\\'.includes(c as string)) {
      out += `\\${c}`;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/** True if `relativePath` (forward-slash, relative to the project root) matches any of `patterns`. Never throws on a malformed pattern; it just won't match. */
export function matchesIgnore(relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      if (globToRegExp(pattern).test(relativePath)) return true;
    } catch {
      // malformed pattern: skip it rather than crash the whole run (hard rule 7)
    }
  }
  return false;
}
