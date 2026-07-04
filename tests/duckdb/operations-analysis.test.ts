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
  setTableMetadata: vi.fn()
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
});
