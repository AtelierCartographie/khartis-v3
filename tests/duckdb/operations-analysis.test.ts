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
import { getTableMetadata } from '$lib/features/duckdb/cache/cache-manager';
import { LogCategory } from '$lib/features/commons/utils/logger';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

const mockDescribeResult = [
  { name: 'id', type: 'INTEGER', type_simple: 'other' },
  { name: 'label', type: 'VARCHAR', type_simple: 'other' }
];

function arrowRow(row: Record<string, unknown>) {
  return {
    get: vi.fn(() => row)
  };
}

describe('analyse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTableMetadata).mockReturnValue({} as never);
    executeQueryMock.mockResolvedValue(mockDescribeResult);
  });

  it('returns cached analysis without calling executeQuery when cache is warm', async () => {
    const cachedAnalysis = [{ name: 'id', type_simple: 'numeric' }];
    vi.mocked(getTableMetadata).mockReturnValue({
      analysis: cachedAnalysis
    } as never);
    const result = await analyse(ctx(), 'tbl');
    expect(result).toBe(cachedAnalysis);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('calls executeQuery on cache miss and returns describe_full results', async () => {
    const result = await analyse(ctx(), 'tbl');
    expect(executeQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('describe_full'),
      expect.anything()
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('bypasses cache when force=true even if cached analysis exists', async () => {
    const cachedAnalysis = [{ name: 'id', type_simple: 'numeric' }];
    vi.mocked(getTableMetadata).mockReturnValue({
      analysis: cachedAnalysis
    } as never);
    await analyse(ctx(), 'tbl', { force: true });
    expect(executeQueryMock).toHaveBeenCalled();
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

  it('should issue one merged query per type family and map results per column', async () => {
    executeQueryMock.mockImplementation(async (_connection, sql: string) => {
      if (sql.includes('describe_full')) {
        return [
          { name: 'pop', type: 'INTEGER', type_simple: 'numeric' },
          { name: 'rate', type: 'DOUBLE', type_simple: 'numeric' },
          { name: 'day', type: 'DATE', type_simple: 'date' },
          { name: 'cat', type: 'VARCHAR', type_simple: 'string' }
        ];
      }
      if (sql.includes('first(alias(')) {
        return arrowRow({
          __c0_name: 'pop',
          __c0_uniques: 9,
          __c1_name: 'rate',
          __c1_uniques: 8,
          __c2_name: 'day',
          __c2_uniques: 5,
          __c3_name: 'cat',
          __c3_uniques: 3
        });
      }
      if (sql.includes('POSITIONAL JOIN')) {
        return arrowRow({
          __c0_min: 1,
          __c0_max: 4,
          __c0_share_rank_interval: 1,
          __c1_min: -2,
          __c1_max: 2,
          __c1_share_rank_interval: 0
        });
      }
      if (sql.includes('row_number() OVER ()')) {
        return arrowRow({
          __c0: [{ bin: 1, count: 2 }],
          __c1: [{ bin: 0.5, count: 3 }],
          __c2: [{ bin: '2020-01-01', count: 1 }],
          __c3: [{ category: 'a', count: 2, percent: 0.4 }]
        });
      }
      if (sql.includes('__c0_min')) {
        return arrowRow({ __c0_min: 'D1', __c0_max: 'D2' });
      }
      return [];
    });

    const result = await analyse(ctx(), 'tbl');

    const statisticQueries = executeQueryMock.mock.calls
      .map((call) => String(call[1]))
      .filter((sql) => !sql.startsWith('DROP TABLE IF EXISTS'));
    expect(statisticQueries).toHaveLength(5);

    expect(result.map((column) => column.name)).toEqual([
      'pop',
      'rate',
      'day',
      'cat'
    ]);
    expect(result[0]).toMatchObject({
      uniques: 9,
      min: 1,
      max: 4,
      share_rank_interval: 1
    });
    expect(result[1]).toMatchObject({
      uniques: 8,
      min: -2,
      max: 2,
      share_rank_interval: 0
    });
    expect(result[2]).toMatchObject({ uniques: 5, min: 'D1', max: 'D2' });
    expect('share_rank_interval' in result[2]).toBe(false);
    expect(result[3]).toMatchObject({ uniques: 3 });
    expect('min' in result[3]).toBe(false);

    const histogramRows = (value: unknown): unknown =>
      value !== null &&
      typeof value === 'object' &&
      'toArray' in value &&
      typeof value.toArray === 'function'
        ? value.toArray()
        : value;
    expect(histogramRows(result[0].histogram)).toEqual([{ bin: 1, count: 2 }]);
    expect(histogramRows(result[2].histogram)).toEqual([
      { bin: '2020-01-01', count: 1 }
    ]);
    expect(histogramRows(result[3].histogram)).toEqual([
      { category: 'a', count: 2, percent: 0.4 }
    ]);

    expect(loggerWarnMock).not.toHaveBeenCalled();
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
