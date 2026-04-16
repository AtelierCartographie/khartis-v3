import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeQueryMock } = vi.hoisted(() => ({ executeQueryMock: vi.fn() }));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));
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
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

const mockDescribeResult = [
  { name: 'id', type: 'INTEGER', type_simple: 'other' },
  { name: 'label', type: 'VARCHAR', type_simple: 'other' }
];

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
});
