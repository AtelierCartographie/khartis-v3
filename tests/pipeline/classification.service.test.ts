import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';

const queryMock = vi.hoisted(() => vi.fn());
const getDatasetBySourceFileMock = vi.hoisted(() => vi.fn());
const classificationMethodMock = vi.hoisted(() => ({
  EQUAL_INTERVAL: 'equal_interval',
  QUANTILES: 'quantiles',
  JENKS: 'jenks',
  MANUAL: 'manual',
  STANDARD_DEVIATION: 'standard_deviation',
  Q6: 'q6',
  NESTED_MEANS: 'nested_means',
  HEAD_TAIL: 'head_tail'
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: classificationMethodMock
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: queryMock
  },
  initDuckDB: vi.fn(),
  GEO_CONSTANTS: {
    WGS84_CRS: 'OGC:CRS84'
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: getDatasetBySourceFileMock
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA'
  },
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}));

import {
  applyPaletteInversion,
  calculateBreaks
} from '$lib/features/commons/services/classification.service';

const QUANTILES = 'quantiles' as ClassificationMethod;
const STANDARD_DEVIATION = 'standard_deviation' as ClassificationMethod;

function createTable<T>(rows: T[]) {
  const firstRow = rows[0] as Record<string, unknown> | undefined;

  return {
    numRows: rows.length,
    toArray: () => rows,
    getChild: (name: string) => ({
      get: (index: number) =>
        rows[index] && firstRow && name in firstRow
          ? (rows[index] as Record<string, unknown>)[name]
          : undefined
    })
  };
}

describe('classification service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDatasetBySourceFileMock.mockReturnValue({
      tableName: 'demo_table'
    });
  });

  it('uses the quantile macro and rounds thresholds by default', async () => {
    queryMock
      .mockResolvedValueOnce(
        createTable([
          {
            cnt: 30
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            min_val: 1,
            max_val: 30
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            breaks: [10, 20]
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            rounded: [11, 21]
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            cnt_0: 2,
            cnt_1: 2,
            cnt_2: 2
          }
        ])
      );

    const result = await calculateBreaks({
      datasetId: 'source-file',
      columnName: 'population',
      method: QUANTILES,
      numClasses: 3
    });

    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      "SELECT quantile('demo_table', 'population', 3) as breaks"
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      4,
      "SELECT round_thresholds([10, 20], 'demo_table', 'population') as rounded"
    );
    expect(result).toEqual({
      breaks: [11, 21],
      counts: [2, 2, 2],
      min: 1,
      max: 30
    });
  });

  it('maps legacy standard deviation classifications to nested means', async () => {
    queryMock
      .mockResolvedValueOnce(
        createTable([
          {
            cnt: 30
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            min_val: 1,
            max_val: 30
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            breaks: [4, 11, 25]
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            rounded: [4, 11, 25]
          }
        ])
      )
      .mockResolvedValueOnce(
        createTable([
          {
            cnt_0: 2,
            cnt_1: 2,
            cnt_2: 1,
            cnt_3: 1
          }
        ])
      );

    await calculateBreaks({
      datasetId: 'source-file',
      columnName: 'population',
      method: STANDARD_DEVIATION,
      numClasses: 4
    });

    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      "SELECT nested_means('demo_table', 'population', 4) as breaks"
    );
  });

  it('preserves palette direction unless inversion is requested', () => {
    const colors = ['#111111', '#222222', '#333333'];

    expect(applyPaletteInversion(colors, false)).toEqual(colors);
    expect(applyPaletteInversion(colors, true)).toEqual([
      '#333333',
      '#222222',
      '#111111'
    ]);
    expect(colors).toEqual(['#111111', '#222222', '#333333']);
  });
});
