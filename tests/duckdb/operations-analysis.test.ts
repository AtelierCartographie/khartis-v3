import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DuckDBSimplifiedType } from '$lib/features/duckdb/types';

const { executeQueryMock, loggerErrorMock, loggerWarnMock } = vi.hoisted(
  () => ({
    executeQueryMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn()
  })
);

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));
vi.mock('$lib/features/commons/utils/logger', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/features/commons/utils/logger')
  >('$lib/features/commons/utils/logger');

  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: loggerErrorMock,
      warn: loggerWarnMock
    }
  };
});
vi.mock('$lib/features/duckdb/operations/table-ops', () => ({
  describeTable: vi.fn(),
  getRowCount: vi.fn().mockResolvedValue(10)
}));
vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  getTableMetadata: vi.fn(() => ({})),
  setTableMetadata: vi.fn(),
  registerTableMutationCallback: vi.fn()
}));

import { analyse } from '$lib/features/duckdb/operations/analysis';
import { LogCategory } from '$lib/features/commons/utils/logger';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

function arrowRow(row: Record<string, unknown>) {
  return {
    get: vi.fn(() => row)
  };
}

describe('analyse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs failed per-column statistics while returning partial analysis', async () => {
    const generalError = new Error('general summary failed');
    const histogramError = new Error('histogram failed');
    executeQueryMock.mockImplementation(async (_connection, sql: string) => {
      if (sql.includes('describe_full')) {
        return [
          {
            name: 'value',
            type: 'DOUBLE',
            type_simple: DuckDBSimplifiedType.NUMERIC
          }
        ];
      }
      if (sql.includes('summary_general')) {
        throw generalError;
      }
      if (sql.includes('summary_numeric')) {
        return arrowRow({ min: 1, max: 4 });
      }
      if (sql.includes('histogram_numeric')) {
        throw histogramError;
      }
      return [];
    });

    const result = await analyse(ctx(), 'tbl');

    expect(result).toEqual([
      {
        name: 'value',
        type: 'DOUBLE',
        type_simple: DuckDBSimplifiedType.NUMERIC,
        min: 1,
        max: 4,
        histogram: null
      }
    ]);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to compute DuckDB analysis statistic',
      LogCategory.DUCKDB,
      {
        error: generalError,
        flow: 'duckdb_analysis',
        extra: {
          tableName: 'tbl',
          analysisTable: 'tbl',
          columnName: 'value',
          statistic: 'summary_general'
        }
      }
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to compute DuckDB analysis statistic',
      LogCategory.DUCKDB,
      {
        error: histogramError,
        flow: 'duckdb_analysis',
        extra: {
          tableName: 'tbl',
          analysisTable: 'tbl',
          columnName: 'value',
          statistic: 'histogram_numeric'
        }
      }
    );
  });

  it('should reject when the categorical histogram fails in merged and per-column form', async () => {
    const categoricalError = new Error('categorical histogram failed');
    executeQueryMock.mockImplementation(async (_connection, sql: string) => {
      if (sql.includes('describe_full')) {
        return [{ name: 'label', type: 'VARCHAR', type_simple: 'string' }];
      }
      if (sql.includes('first(alias(')) {
        return arrowRow({ __c0_uniques: 2 });
      }
      if (sql.includes('row_number() OVER ()')) {
        throw new Error('merged histogram failed');
      }
      if (sql.includes('histogram_categorical')) {
        throw categoricalError;
      }
      return [];
    });

    await expect(analyse(ctx(), 'tbl')).rejects.toThrow(
      'categorical histogram failed'
    );
  });
});
