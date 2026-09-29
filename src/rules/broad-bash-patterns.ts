// Shared "this Bash permission rule grants or blocks everything" pattern,
// used by SET-01 (too broad an allow rule is risky) and SET-04 (too broad a
// deny rule blocks legitimate work). Only the exact blanket forms count as
// "broad" here: a narrow deny targeting one risky prefix (e.g.
// `Bash(rm -rf:*)`) is exactly the good practice these two rules want to
// encourage, not something either should flag.
export const EXACT_BROAD_BASH_PATTERNS = new Set(['Bash', 'Bash(*)', 'Bash(:*)', '*']);
