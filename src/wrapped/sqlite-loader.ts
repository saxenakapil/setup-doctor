// Guarded dynamic import of the built-in `node:sqlite` module, used to read
// Cursor's local state.vscdb databases. Same pattern as render/png.ts's
// optional @resvg/resvg-js load: `node:sqlite` only exists from Node 22.5
// onward (this project supports Node 20+), so it must never be a static
// import. When it is missing, callers get null and treat Cursor Wrapped as
// unsupported on this Node version, the same shape as the existing
// "PNG needs the optional package" fallback.
//
// Node prints an "ExperimentalWarning: SQLite is an experimental feature"
// line to stderr the first time the module loads, with no supported way to
// opt out short of removing the process's own default warning listener.
// This tool's output must stay clean and deterministic (see CLAUDE.md hard
// rule 9's spirit and docs/scope.md's "never print anything unexpected"),
// so the default listener is removed once, right before the import that
// would trigger it.

export interface SqliteRow {
  [column: string]: unknown;
}

export interface SqliteStatement {
  all(...params: unknown[]): SqliteRow[];
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => SqliteDatabase;
}

let cached: SqliteModule | null | undefined;

export async function loadSqlite(): Promise<SqliteModule | null> {
  if (cached !== undefined) return cached;
  try {
    process.removeAllListeners('warning');
    cached = (await import('node:sqlite')) as unknown as SqliteModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Opens `path` read-only, or returns null if the file is missing, locked or otherwise unreadable. */
export async function openReadOnly(path: string): Promise<SqliteDatabase | null> {
  const sqlite = await loadSqlite();
  if (!sqlite) return null;
  try {
    return new sqlite.DatabaseSync(path, { readOnly: true });
  } catch {
    return null;
  }
}
