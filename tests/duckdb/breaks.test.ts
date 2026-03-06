import { describe, expect, it } from 'vitest';

import { breaks } from '$lib/features/duckdb/macros/breaks';

describe('classification macros', () => {
  it('registers head-tail variants as macros so column identifiers are substituted correctly', () => {
    expect(breaks).toContain('CREATE OR REPLACE MACRO headtail(');
    expect(breaks).toContain('CREATE OR REPLACE MACRO headtail2(');
    expect(breaks).not.toContain('CREATE OR REPLACE FUNCTION headtail(');
    expect(breaks).not.toContain('CREATE OR REPLACE FUNCTION headtail2(');
  });

  it('projects dynamic columns through COLUMNS() before aggregating or rounding', () => {
    expect(breaks).toContain('SELECT COLUMNS(c -> c = colname) AS value');
    expect(breaks).toContain('SELECT quantile_disc(value');
    expect(breaks).toContain('SELECT equi_width_bins(MIN(value), MAX(value)');
    expect(breaks).toContain('SELECT avg(value)');
    expect(breaks).toContain('max(value) FILTER (WHERE value <= break)');
    expect(breaks).not.toContain('avg("colname")');
    expect(breaks).not.toContain('FILTER("colname" <= break)');
  });
});
