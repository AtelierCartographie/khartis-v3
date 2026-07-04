import { describe, expect, it } from 'vitest';
import {
  buildFilterSQL,
  buildFilterWhereClause,
  formatFilterValue
} from '$lib/features/duckdb/orchestrator/filter-ops';
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

describe('formatFilterValue', () => {
  it('returns NULL for undefined', () =>
    expect(formatFilterValue(undefined)).toBe('NULL'));
  it('returns numeric string as-is', () =>
    expect(formatFilterValue(42)).toBe('42'));
  it('wraps string values in single quotes', () =>
    expect(formatFilterValue('paris')).toBe("'paris'"));
  it('returns empty string literal for empty string', () =>
    expect(formatFilterValue('')).toBe("''"));
});

describe('buildFilterSQL — all 10 operators', () => {
  const tbl = 'mytable';

  it('GTE — generates numeric cast comparison', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.GTE, 100));
    expect(sql).toContain('>=');
    expect(sql).toContain('100');
  });

  it('LTE — generates numeric cast comparison', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.LTE, 50));
    expect(sql).toContain('<=');
    expect(sql).toContain('50');
  });

  it('CONTAINS — generates ILIKE with wildcard wrapping', () => {
    const sql = buildFilterSQL(
      tbl,
      filter(FilterOperatorEnum.CONTAINS, 'pari')
    );
    expect(sql).toContain('ILIKE');
    expect(sql).toContain("'pari'");
  });

  it('EQUALS — generates exact equality', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.EQUALS, 'paris'));
    expect(sql).toContain('=');
    expect(sql).toContain("'paris'");
  });

  it('NOT_EQUALS — generates inequality', () => {
    const sql = buildFilterSQL(
      tbl,
      filter(FilterOperatorEnum.NOT_EQUALS, 'paris')
    );
    expect(sql).toContain('<>');
    expect(sql).toContain("'paris'");
  });

  it('BETWEEN — generates range with correct order (min <= max)', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.BETWEEN, 10, 50));
    expect(sql).toContain('BETWEEN');
    expect(sql).toContain('10');
    expect(sql).toContain('50');
  });

  it('BETWEEN — swaps bounds when min > max', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.BETWEEN, 50, 10));
    expect(sql).toContain('BETWEEN');
    const idxMin = sql.indexOf('10');
    const idxMax = sql.indexOf('50');
    expect(idxMin).toBeLessThan(idxMax);
  });

  it('TOP_ASC — generates ORDER BY ASC with LIMIT', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.TOP_ASC, 5));
    expect(sql).toContain('ASC');
    expect(sql).toContain('LIMIT 5');
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

  it('TOP_DESC — generates ORDER BY DESC with LIMIT', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.TOP_DESC, 3));
    expect(sql).toContain('DESC');
    expect(sql).toContain('LIMIT 3');
  });

  it('EMPTY — generates IS NULL OR empty-string check', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.EMPTY));
    expect(sql).toContain('IS NULL');
    expect(sql).toContain("= ''");
  });

  it('NOT_EMPTY — generates IS NOT NULL AND non-empty check', () => {
    const sql = buildFilterSQL(tbl, filter(FilterOperatorEnum.NOT_EMPTY));
    expect(sql).toContain('IS NOT NULL');
    expect(sql).toContain("<> ''");
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

describe('buildFilterWhereClause', () => {
  it('returns null for empty filter array', () => {
    expect(buildFilterWhereClause([])).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(buildFilterWhereClause(undefined)).toBeNull();
  });

  it('joins multiple filter SQL strings with AND', () => {
    const filters = [
      {
        id: '1',
        column: 'a',
        operator: 'gte',
        value: 1,
        sql: 'a >= 1',
        label: ''
      },
      {
        id: '2',
        column: 'b',
        operator: 'lte',
        value: 10,
        sql: 'b <= 10',
        label: ''
      }
    ] as never;
    expect(buildFilterWhereClause(filters)).toBe('a >= 1 AND b <= 10');
  });
});
