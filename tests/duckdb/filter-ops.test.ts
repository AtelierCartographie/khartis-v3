import { describe, expect, it } from 'vitest';
import { buildFilterSQL } from '$lib/features/duckdb/orchestrator/filter-ops';
import { FilterOperatorEnum } from '$lib/features/duckdb/types';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';

function filter(
  operator: FilterOperatorEnum,
  value?: string | number,
  secondaryValue?: string | number
) {
  return { column: 'pop', operator, value, secondaryValue };
}

function textFilter(
  operator: FilterOperatorEnum,
  value?: string | number,
  secondaryValue?: string | number
) {
  return {
    column: 'description',
    columnType: 'text',
    operator,
    value,
    secondaryValue
  };
}

describe('buildFilterSQL', () => {
  const tbl = 'mytable';

  it('BETWEEN — swaps bounds when min > max', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.BETWEEN, 50, 10));
    expect(sql).toContain('BETWEEN');
    const idxMin = sql.indexOf('10');
    const idxMax = sql.indexOf('50');
    expect(idxMin).toBeLessThan(idxMax);
  });

  it('TOP_ASC — escapes quoted table and column identifiers', () => {
    const sql = buildFilterSQL('table"withquote', {
      column: 'x" -- injection',
      operator: FilterOperatorEnum.TOP_ASC,
      value: 2
    });

    expect(sql).toContain('FROM "table""withquote"');
    expect(sql).toContain('ORDER BY "x"" -- injection" ASC');
  });

  it('CONTAINS on text-like columns uses the stripped HTML projection', () => {
    const sql = buildFilterSQL(
      tbl,
      textFilter(FilterOperatorEnum.CONTAINS, 'Tras Street')
    );
    expect(sql).toContain('strip_html_text("description"::VARCHAR)');
    expect(sql).toContain("ILIKE '%' || 'Tras Street' || '%'");
  });

  it('EQUALS on text-like columns stays textual for numeric-looking values', () => {
    const sql = buildFilterSQL(
      tbl,
      textFilter(FilterOperatorEnum.EQUALS, '42')
    );
    expect(sql).toContain(`strip_html_text("description"::VARCHAR) = '42'`);
  });

  it('EMPTY on text-like columns uses the stripped HTML projection', () => {
    const sql = buildFilterSQL(tbl, textFilter(FilterOperatorEnum.EMPTY));
    expect(sql).toContain(
      `"description" IS NULL OR strip_html_text("description"::VARCHAR) = ''`
    );
  });

  it('GTE without value throws DuckDBError', () => {
    expect(() => buildFilterSQL(tbl, filter(FilterOperatorEnum.GTE))).toThrow(
      DuckDBError
    );
  });

  it('TOP_ASC with non-positive limit throws DuckDBError', () => {
    expect(() =>
      buildFilterSQL(tbl, filter(FilterOperatorEnum.TOP_ASC, 0))
    ).toThrow(DuckDBError);
  });
});
