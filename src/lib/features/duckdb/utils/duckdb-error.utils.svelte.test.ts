import { describe, expect, it } from 'vitest';
import { isMissingDuckTableError } from './duckdb-error.utils';

describe('isMissingDuckTableError', () => {
  it('matches DuckDB missing-table catalog errors', () => {
    expect(
      isMissingDuckTableError(
        new Error('Catalog Error: Table with name geo_table does not exist!')
      )
    ).toBe(true);
    expect(
      isMissingDuckTableError(
        new Error('Catalog Error: Table with name tmp_enriched not found')
      )
    ).toBe(true);
  });

  it('rejects non-missing-table errors', () => {
    expect(
      isMissingDuckTableError(new Error('Parser Error: syntax error'))
    ).toBe(false);
    expect(
      isMissingDuckTableError('Catalog Error: Table with name x not found')
    ).toBe(false);
    expect(isMissingDuckTableError(null)).toBe(false);
  });
});
