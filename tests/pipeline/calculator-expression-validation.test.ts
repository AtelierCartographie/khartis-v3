import { describe, expect, it } from 'vitest';
import { validateExpression } from '$lib/features/duckdb/orchestrator/column-ops';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';

describe('validateExpression — calculator SQL safety', () => {
  it('throws a DuckDBError on an empty or whitespace-only expression', () => {
    expect(() => validateExpression('')).toThrow(DuckDBError);
    expect(() => validateExpression('   ')).toThrow(DuckDBError);
  });

  it('throws a DuckDBError when the expression contains a semicolon', () => {
    expect(() => validateExpression('"pop" + 1; DROP TABLE t')).toThrow(
      DuckDBError
    );
  });

  it('throws a DuckDBError on a subquery', () => {
    expect(() => validateExpression('(SELECT max("pop") FROM t)')).toThrow(
      DuckDBError
    );
  });

  it('throws a DuckDBError on blocked SQL keywords used as SQL', () => {
    expect(() => validateExpression('DROP TABLE t')).toThrow(DuckDBError);
    expect(() => validateExpression('DELETE FROM t')).toThrow(DuckDBError);
    expect(() => validateExpression('1 SELECT 2')).toThrow(DuckDBError);
  });

  it('throws a DuckDBError on blocked file-reading functions', () => {
    expect(() => validateExpression("read_csv('x.csv')")).toThrow(DuckDBError);
    expect(() => validateExpression("st_read('x.shp')")).toThrow(DuckDBError);
  });

  it('does not throw when a blocked token appears only inside a string literal', () => {
    expect(() =>
      validateExpression("'DROP and SELECT FROM Paris'")
    ).not.toThrow();
  });

  it('does not throw on a legitimate arithmetic/function expression', () => {
    expect(() =>
      validateExpression('round("births" / "population" * 1000, 2)')
    ).not.toThrow();
  });
});
