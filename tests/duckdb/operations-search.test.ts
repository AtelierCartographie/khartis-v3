import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogCategory } from '$lib/features/commons/utils/logger';

const { executeQueryMock, executeCancellableQueryMock, loggerErrorMock } =
  vi.hoisted(() => ({
    executeQueryMock: vi.fn(),
    executeCancellableQueryMock: vi.fn(),
    loggerErrorMock: vi.fn()
  }));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock,
  executeCancellableQuery: executeCancellableQueryMock,
  isQueryAbortError: (error: unknown) =>
    error instanceof DOMException && error.name === 'AbortError'
}));
vi.mock('$lib/features/commons/utils/logger', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/features/commons/utils/logger')
  >('$lib/features/commons/utils/logger');

  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: loggerErrorMock
    }
  };
});
vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  registerTableMutationCallback: vi.fn(),
  getTableMetadata: vi.fn(() => ({}))
}));

import { searchInTable } from '$lib/features/duckdb/operations/search';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

describe('searchInTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty result for an empty query string without hitting the database', async () => {
    const result = await searchInTable(ctx(), 'mytable', '');
    expect(result.results).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('returns empty result for a whitespace-only query without hitting the database', async () => {
    const result = await searchInTable(ctx(), 'mytable', '   ');
    expect(result.results).toHaveLength(0);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('exposes isSampled flag as false for empty result', async () => {
    const result = await searchInTable(ctx(), 'mytable', '');
    expect(result.isSampled).toBe(false);
  });

  it('projects HTML-like text in generated DuckDB search SQL', async () => {
    executeQueryMock
      .mockResolvedValueOnce([
        {
          normalized_term: 'tras street',
          row_count: 1,
          col_count: 1
        }
      ])
      .mockResolvedValueOnce([{ column_name: 'Description' }]);
    executeCancellableQueryMock
      .mockResolvedValueOnce([
        {
          __id: 1,
          column_name: 'Description',
          column_value: 'The Pit Tras Street',
          score: 1
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await searchInTable(ctx(), 'mytable', 'Tras Street');

    expect(result.results).toEqual([
      {
        rowId: 1,
        columnName: 'Description',
        value: 'The Pit Tras Street',
        score: 1
      }
    ]);

    const exactSearchSql = executeCancellableQueryMock.mock.calls[0]?.[1];
    expect(exactSearchSql).toContain(
      'strip_html_text("Description"::VARCHAR) AS column_value'
    );
    expect(exactSearchSql).toContain(
      'length(trim(strip_html_text("Description"::VARCHAR))) > 0'
    );
  });

  it('keeps fuzzy-search cache entries separate by threshold', async () => {
    executeQueryMock
      .mockResolvedValueOnce([
        { normalized_term: 'brnschweig', row_count: 1, col_count: 1 }
      ])
      .mockResolvedValueOnce([{ column_name: 'Name' }])
      .mockResolvedValueOnce([
        { normalized_term: 'brnschweig', row_count: 1, col_count: 1 }
      ])
      .mockResolvedValueOnce([{ column_name: 'Name' }]);
    executeCancellableQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          __id: 1,
          column_name: 'Name',
          column_value: 'Braunschweig',
          score: 0.91
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          __id: 1,
          column_name: 'Name',
          column_value: 'Braunschweig',
          score: 0.91
        }
      ]);

    await searchInTable(ctx(), 'threshold_table', 'Brnschweig', {
      threshold: 0.9
    });
    await searchInTable(ctx(), 'threshold_table', 'Brnschweig', {
      threshold: 0.5
    });

    expect(executeQueryMock).toHaveBeenCalledTimes(4);
    expect(executeCancellableQueryMock).toHaveBeenCalledTimes(4);
  });

  it('returns an empty result without logging when the search query is aborted', async () => {
    executeQueryMock
      .mockResolvedValueOnce([
        { normalized_term: 'needle', row_count: 1, col_count: 1 }
      ])
      .mockResolvedValueOnce([{ column_name: 'Name' }]);
    executeCancellableQueryMock.mockRejectedValueOnce(
      new DOMException('DuckDB query aborted', 'AbortError')
    );

    const result = await searchInTable(ctx(), 'aborted_table', 'needle');

    expect(result.totalCount).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('aborts the previous in-flight search when a newer one starts', async () => {
    const capturedSignals: AbortSignal[] = [];
    executeQueryMock.mockImplementation(async (_connection, sql: string) =>
      String(sql).includes('normalize_text')
        ? [{ normalized_term: 'needle', row_count: 1, col_count: 1 }]
        : [{ column_name: 'Name' }]
    );
    executeCancellableQueryMock.mockImplementation(
      async (
        _connection: unknown,
        _sql: string,
        options: { signal: AbortSignal }
      ) => {
        capturedSignals.push(options.signal);
        if (capturedSignals.length === 1) {
          return new Promise((_, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('DuckDB query aborted', 'AbortError'))
            );
          });
        }
        return [];
      }
    );

    const firstSearch = searchInTable(ctx(), 'race_table', 'first needle');
    await vi.waitFor(() => {
      expect(capturedSignals).toHaveLength(1);
    });

    const secondSearch = searchInTable(ctx(), 'race_table', 'second needle');

    const [firstResult, secondResult] = await Promise.all([
      firstSearch,
      secondSearch
    ]);

    expect(capturedSignals[0].aborted).toBe(true);
    expect(firstResult.totalCount).toBe(0);
    expect(secondResult).toBeDefined();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('logs and rethrows query failures instead of returning an empty result', async () => {
    const error = new Error('search query failed');
    executeQueryMock.mockRejectedValue(error);

    await expect(
      searchInTable(ctx(), 'broken_search_table', 'needle')
    ).rejects.toBe(error);

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Search query failed',
      LogCategory.DUCKDB,
      {
        table: 'broken_search_table',
        searchQuery: 'needle',
        error
      }
    );
  });
});
