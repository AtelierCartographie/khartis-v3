import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  tableName: 't' as string | null,
  queryMock: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: (...args: unknown[]) => mocks.queryMock(...args) }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: () =>
      mocks.tableName ? { tableName: mocks.tableName } : null
  }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ClassificationMethod: {
    KMEANS: 'kmeans',
    MANUAL: 'manual',
    QUANTILES: 'quantiles',
    EQUAL_INTERVAL: 'equal_interval',
    Q6: 'q6',
    NESTED_MEANS: 'nested_means',
    HEAD_TAIL: 'head_tail'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { DATA: 'DATA' },
  logger: {
    warn: mocks.loggerWarn
  }
}));

function statsTable(min: number, max: number) {
  const columns: Record<string, number> = {
    row_count: 12,
    distinct_count: 9,
    min_val: min,
    max_val: max
  };
  return {
    numRows: 1,
    getChild: (name: string) => ({ get: () => columns[name] })
  };
}

type ClassificationServiceModule = typeof import('./classification.service');
let detectDivergingBreakpoint: ClassificationServiceModule['detectDivergingBreakpoint'];

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.tableName = 't';
  ({ detectDivergingBreakpoint } = await import('./classification.service'));
});

describe('detectDivergingBreakpoint (automatic divergent palette rule)', () => {
  it('returns the pivot 0 when the domain crosses zero (negative and positive values)', async () => {
    mocks.queryMock.mockResolvedValue(statsTable(-2, 3));
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBe(0);
  });

  it('returns null for a strictly positive domain', async () => {
    mocks.queryMock.mockResolvedValue(statsTable(1, 5));
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBeNull();
  });

  it('returns null for a strictly negative domain', async () => {
    mocks.queryMock.mockResolvedValue(statsTable(-5, -1));
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBeNull();
  });

  it('does not trigger when the minimum is exactly zero', async () => {
    mocks.queryMock.mockResolvedValue(statsTable(0, 5));
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBeNull();
  });

  it('does not trigger when the maximum is exactly zero', async () => {
    mocks.queryMock.mockResolvedValue(statsTable(-5, 0));
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBeNull();
  });

  it('returns null when the dataset has no DuckDB table', async () => {
    mocks.tableName = null;
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBeNull();
    expect(mocks.queryMock).not.toHaveBeenCalled();
  });

  it('returns null when the stats query fails', async () => {
    mocks.queryMock.mockRejectedValue(new Error('duckdb down'));
    await expect(
      detectDivergingBreakpoint({ datasetId: 'ds', columnName: 'v' })
    ).resolves.toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to detect diverging classification breakpoint',
      'DATA',
      expect.objectContaining({
        error: expect.any(Error),
        flow: 'classification_breakpoint_detection',
        extra: expect.objectContaining({
          datasetId: 'ds',
          columnName: 'v'
        })
      })
    );
  });
});
