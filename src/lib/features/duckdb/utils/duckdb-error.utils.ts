/**
 * DuckDB reports failures as English text only, so every test on that text
 * lives here. `tests/duckdb/duckdb-error.test.ts` triggers each kind it can on
 * the real engine: a version upgrade that rewords a message fails there.
 */
export type DuckDBErrorKind =
  | 'missing-table'
  | 'out-of-memory'
  | 'csv'
  | 'file-unreadable'
  | 'multiple-layers'
  | 'crs-not-found'
  | 'thread-pool';

const PATTERNS: Record<DuckDBErrorKind, RegExp> = {
  'missing-table':
    /Catalog Error:\s*Table with name .*?(does not exist|not found)/i,
  'out-of-memory': /Out of Memory/,
  csv: /read_csv|CSV|delimiter|column count/,
  'file-unreadable': /Could not open file|Invalid file|not a valid/,
  'multiple-layers': /Multiple layers|more than one layer/,
  // Raised by the WASM spatial build only, never by the native engine.
  'crs-not-found': /crs not found/i,
  'thread-pool':
    /thread constructor failed|resource temporarily unavailable|pthread_create/i
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function matchesDuckDBError(
  error: unknown,
  kind: DuckDBErrorKind
): boolean {
  return PATTERNS[kind].test(messageOf(error));
}

/** The 1-based line a CSV read failed on, when the engine names it. */
export function getCsvErrorLine(error: unknown): number | null {
  const line = /CSV Error on Line: (\d+)/.exec(messageOf(error))?.[1];
  return line ? Number(line) : null;
}
