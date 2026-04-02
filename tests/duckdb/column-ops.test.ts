import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import {
  RefineOperation,
  type AnalysisResult
} from '$lib/features/duckdb/types';

const mocks = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerSuccessMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    info: mocks.loggerInfoMock,
    success: mocks.loggerSuccessMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import {
  addCalculatedColumn,
  changeColumnType,
  dropRows,
  refineColumn,
  replaceInColumn,
  testExpression,
  validateExpression
} from '$lib/features/duckdb/orchestrator/column-ops';

function createDuckMock() {
  return {
    query: vi.fn(),
    analyse: vi.fn(),
    drop_rows: vi.fn()
  };
}

describe('column-ops security and behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsafe expressions and accepts safe formulas', () => {
    expect(() => validateExpression('')).toThrow(DuckDBError);
    expect(() => validateExpression('a + 1; DROP TABLE x')).toThrow(
      DuckDBError
    );
    expect(() => validateExpression('(SELECT 1) + 2')).toThrow(DuckDBError);
    expect(() => validateExpression("read_csv('/tmp/x.csv')")).toThrow(
      DuckDBError
    );
    expect(() => validateExpression('price + tax FROM orders')).toThrow(
      DuckDBError
    );

    expect(() =>
      validateExpression("coalesce(name, 'FROM PARIS') || ' / ' || city")
    ).not.toThrow();
  });

  it('changes column type only for allowed SQL types', async () => {
    const Duck = createDuckMock();
    Duck.query.mockResolvedValueOnce(undefined);
    Duck.analyse.mockResolvedValueOnce([]);

    await changeColumnType('dataset', 'population', 'decimal(12, 2)', Duck);

    expect(Duck.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER TABLE "dataset" ALTER COLUMN "population" SET DATA TYPE DECIMAL(12, 2)'
      )
    );
    expect(Duck.analyse).toHaveBeenCalledWith('dataset', { force: true });
  });

  it('rejects unsupported SQL types in type conversion', async () => {
    const Duck = createDuckMock();

    await expect(
      changeColumnType('dataset', 'population', 'drop table users', Duck)
    ).rejects.toThrow(DuckDBError);

    expect(Duck.query).not.toHaveBeenCalled();
  });

  it('skips row deletion when rowIds are empty', async () => {
    const Duck = createDuckMock();
    await dropRows('dataset', [], Duck);
    expect(Duck.drop_rows).not.toHaveBeenCalled();
    expect(Duck.analyse).not.toHaveBeenCalled();
  });

  it('drops rows and refreshes analysis when ids are provided', async () => {
    const Duck = createDuckMock();
    Duck.drop_rows.mockResolvedValueOnce(undefined);
    Duck.analyse.mockResolvedValueOnce([]);

    await dropRows('dataset', [1, 3, 7], Duck);

    expect(Duck.drop_rows).toHaveBeenCalledWith('dataset', [1, 3, 7]);
    expect(Duck.analyse).toHaveBeenCalledWith('dataset', { force: true });
  });

  it('applies refine operation and can skip analysis', async () => {
    const Duck = createDuckMock();
    Duck.query.mockResolvedValueOnce(undefined);

    await refineColumn('dataset', 'city', RefineOperation.UPPERCASE, Duck, {
      skipAnalysis: true
    });

    expect(Duck.query).toHaveBeenCalledWith(
      'UPDATE "dataset" SET "city" = UPPER("city")'
    );
    expect(Duck.analyse).not.toHaveBeenCalled();
  });

  it('applies refine operation and refreshes analysis by default', async () => {
    const Duck = createDuckMock();
    Duck.query.mockResolvedValueOnce(undefined);
    Duck.analyse.mockResolvedValueOnce([]);

    await refineColumn('dataset', 'city', RefineOperation.TRIM_ALL, Duck);

    expect(Duck.query).toHaveBeenCalledWith(
      expect.stringContaining("REGEXP_REPLACE(\"city\", '\\s+', ' ', 'g')")
    );
    expect(Duck.analyse).toHaveBeenCalledWith('dataset', { force: true });
  });

  it('replaces exact normalized matches and triggers analysis', async () => {
    const Duck = createDuckMock();
    Duck.query
      .mockResolvedValueOnce([{ norm: 'ile de france' }])
      .mockResolvedValueOnce({
        get: () => ({ count: 2 })
      })
      .mockResolvedValueOnce(undefined);
    Duck.analyse.mockResolvedValueOnce([]);

    const replaced = await replaceInColumn(
      'dataset',
      'region',
      'Île-de-France',
      'Ile-de-France',
      Duck
    );

    expect(replaced).toBe(2);
    expect(Duck.query).toHaveBeenNthCalledWith(
      1,
      "SELECT normalize_text('Île-de-France') as norm",
      { format: 'array' }
    );
    expect(Duck.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        `UPDATE "dataset" SET "region" = 'Ile-de-France' WHERE normalize_text("region"::VARCHAR) = 'ile de france'`
      )
    );
    expect(Duck.analyse).toHaveBeenCalledWith('dataset', { force: true });
  });

  it('does not update rows when no match is found', async () => {
    const Duck = createDuckMock();
    Duck.query
      .mockResolvedValueOnce([{ norm: 'paris' }])
      .mockResolvedValueOnce({
        get: () => ({ count: 0 })
      });

    const replaced = await replaceInColumn(
      'dataset',
      'city',
      'Paris',
      'PARIS',
      Duck
    );

    expect(replaced).toBe(0);
    expect(Duck.query).toHaveBeenCalledTimes(2);
    expect(Duck.analyse).not.toHaveBeenCalled();
  });

  it('adds calculated columns with duplicate and skip-analysis safeguards', async () => {
    const Duck = createDuckMock();
    const existingColumns = [{ name: 'id' } as AnalysisResult];
    const updatedColumns = [
      { name: 'id' },
      { name: 'ratio' }
    ] as AnalysisResult[];

    await expect(
      addCalculatedColumn('dataset', '   ', '1 + 1', Duck)
    ).rejects.toThrow(DuckDBError);

    Duck.analyse.mockResolvedValueOnce([{ name: 'ratio' } as AnalysisResult]);
    await expect(
      addCalculatedColumn('dataset', 'ratio', '1 + 1', Duck)
    ).rejects.toThrow(DuckDBError);

    Duck.analyse
      .mockResolvedValueOnce(existingColumns)
      .mockResolvedValueOnce(updatedColumns);
    Duck.query.mockResolvedValueOnce(undefined);

    const result = await addCalculatedColumn(
      'dataset',
      'ratio',
      'population / households',
      Duck
    );
    expect(result).toEqual(updatedColumns);
    expect(Duck.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE OR REPLACE TABLE "dataset" AS SELECT *, (population / households) AS "ratio" FROM "dataset"'
      )
    );

    Duck.analyse.mockResolvedValueOnce(existingColumns);
    const skipped = await addCalculatedColumn(
      'dataset',
      'ratio_2',
      'population / 2',
      Duck,
      { skipAnalysis: true }
    );
    expect(skipped).toEqual(existingColumns);
  });

  it('tests expression and returns first result or null', async () => {
    const Duck = createDuckMock();

    Duck.query.mockResolvedValueOnce({
      numRows: 0,
      get: () => ({})
    });
    await expect(testExpression('dataset', '1 + 1', Duck)).resolves.toBeNull();

    Duck.query.mockResolvedValueOnce({
      numRows: 1,
      get: () => ({ result: 42 })
    });
    await expect(testExpression('dataset', '40 + 2', Duck)).resolves.toBe(42);
  });
});
