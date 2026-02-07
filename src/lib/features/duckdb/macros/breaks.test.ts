import { describe, expect, it } from 'vitest';
import { breaks } from './breaks';

describe('duckdb breaks macros', () => {
  it('uses query_table for table-name parameters', () => {
    expect(breaks).not.toContain('FROM query(tabname)');
    expect(breaks).toContain('FROM query_table(tabname::VARCHAR)');
  });
});
