import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: vi.fn() }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: { getDatasetBySourceFile: vi.fn() }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ClassificationMethod: {
    EQUAL_INTERVAL: 'equal_interval',
    QUANTILES: 'quantiles',
    KMEANS: 'kmeans',
    MANUAL: 'manual',
    Q6: 'q6',
    NESTED_MEANS: 'nested_means',
    HEAD_TAIL: 'head_tail'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  LogCategory: { DATA: 'DATA' }
}));

import {
  calculateBreakCounts,
  calculateDivergingBreaks,
  calculateBreaks,
  suggestClassificationDefaults
} from '$lib/features/commons/services/classification.service';
import { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';
import { logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';

const mockedDuckQuery = vi.mocked(Duck.query);
const mockedGetDatasetBySourceFile = vi.mocked(
  duckDBOrchestrator.getDatasetBySourceFile
);
const mockedLoggerWarn = vi.mocked(logger.warn);

function makeTable(row: Record<string, unknown>) {
  return {
    numRows: 1,
    getChild: (name: string) => ({
      get: () => row[name]
    })
  };
}

beforeEach(() => {
  mockedDuckQuery.mockReset();
  mockedGetDatasetBySourceFile.mockReset();
  mockedLoggerWarn.mockReset();
});

describe('calculateBreaks', () => {
  it('computes K-means breaks through the DuckDB macro and rounds them', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: 'vals_kmeans_test'
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({
          distinct_count: 9,
          min_val: 0,
          max_val: 100
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          breaks: [33.2, 54.9, 77.1]
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          rounded: [35, 55, 75]
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          cnt_0: 1,
          cnt_1: 2,
          cnt_2: 3,
          cnt_3: 4
        }) as never
      )
      .mockResolvedValueOnce(makeTable({ bounds: [0, 100] }) as never);

    const result = await calculateBreaks({
      datasetId: 'source-kmeans',
      columnName: 'value',
      method: 'kmeans' as never,
      numClasses: 4
    });

    expect(result).toEqual({
      breaks: [35, 55, 75],
      counts: [1, 2, 3, 4],
      min: 0,
      max: 100,
      roundedMin: 0,
      roundedMax: 100
    });
    expect(mockedDuckQuery.mock.calls[1]?.[0]).toContain('kmeans');
    expect(mockedDuckQuery.mock.calls[2]?.[0]).toContain('round_thresholds');
  });

  it('clamps nested_means to the lower-or-equal power of two when classes reach the distinct count', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: 'vals_nested_clamp_test'
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({
          row_count: 30,
          distinct_count: 6,
          min_val: 0,
          max_val: 100
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          breaks: [20, 45, 70]
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          rounded: [20, 45, 70]
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          cnt_0: 10,
          cnt_1: 8,
          cnt_2: 7,
          cnt_3: 5
        }) as never
      )
      .mockResolvedValueOnce(makeTable({ bounds: [0, 100] }) as never);

    const result = await calculateBreaks({
      datasetId: 'source-nested-clamp',
      columnName: 'value',
      method: ClassificationMethod.NESTED_MEANS,
      numClasses: 8
    });

    expect(result).toEqual({
      breaks: [20, 45, 70],
      counts: [10, 8, 7, 5],
      min: 0,
      max: 100,
      roundedMin: 0,
      roundedMax: 100
    });
    expect(mockedDuckQuery.mock.calls[1]?.[0]).toContain('nested_means');
    expect(mockedDuckQuery.mock.calls[1]?.[0]).toContain(', 4)');
  });
});

describe('calculateBreakCounts', () => {
  it('sanitizes manual breaks and recomputes counts against the dataset range', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: 'vals_manual_test'
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({
          distinct_count: 9,
          min_val: 0,
          max_val: 100
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          cnt_0: 4,
          cnt_1: 3,
          cnt_2: 2
        }) as never
      );

    const result = await calculateBreakCounts({
      datasetId: 'source-manual',
      columnName: 'value',
      breaks: [-10, 25, 25, 75, 150]
    });

    expect(result).toEqual({
      breaks: [25, 75],
      counts: [4, 3, 2],
      min: 0,
      max: 100
    });
    expect(mockedDuckQuery.mock.calls[1]?.[0]).toContain('cnt_0');
    expect(mockedDuckQuery.mock.calls[1]?.[0]).not.toContain('-10');
    expect(mockedDuckQuery.mock.calls[1]?.[0]).not.toContain('150');
  });
});

describe('calculateDivergingBreaks', () => {
  it('runs the selected macro independently below and above the breakpoint', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: 'vals_diverging_test'
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce({ numRows: 0 } as never)
      .mockResolvedValueOnce(
        makeTable({
          row_count: 3,
          distinct_count: 3,
          min_val: 0,
          max_val: 49
        }) as never
      )
      .mockResolvedValueOnce(makeTable({ breaks: [20] }) as never)
      .mockResolvedValueOnce(makeTable({ rounded: [25] }) as never)
      .mockResolvedValueOnce(makeTable({ cnt_0: 1, cnt_1: 2 }) as never)
      .mockResolvedValueOnce(makeTable({ bounds: [0, 49] }) as never)
      .mockResolvedValueOnce({ numRows: 0 } as never)
      .mockResolvedValueOnce({ numRows: 0 } as never)
      .mockResolvedValueOnce(
        makeTable({
          row_count: 7,
          distinct_count: 4,
          min_val: 50,
          max_val: 100
        }) as never
      )
      .mockResolvedValueOnce(makeTable({ breaks: [80] }) as never)
      .mockResolvedValueOnce(makeTable({ rounded: [75] }) as never)
      .mockResolvedValueOnce(makeTable({ cnt_0: 3, cnt_1: 4 }) as never)
      .mockResolvedValueOnce(makeTable({ bounds: [50, 100] }) as never)
      .mockResolvedValueOnce({ numRows: 0 } as never);

    const result = await calculateDivergingBreaks({
      datasetId: 'src-diverging',
      columnName: 'value',
      method: 'quantiles' as never,
      breakpointValue: 50,
      lowerClassCount: 2,
      upperClassCount: 2
    });

    expect(result).toEqual({
      breaks: [25, 50, 75],
      counts: [1, 2, 3, 4],
      min: 0,
      max: 100,
      roundedMin: 0,
      roundedMax: 100,
      breakpointLowerClassCount: 2
    });
    const queries = mockedDuckQuery.mock.calls.map((call) => call[0] as string);
    expect(queries[0]).toContain('< 50');
    expect(queries[7]).toContain('>= 50');
    expect(queries[2]).toContain('quantile(');
    expect(queries[9]).toContain('quantile(');
  });
});

describe('calculateBreaks — macro methods', () => {
  let tableCounter = 0;

  function uniqueTable(): string {
    tableCounter += 1;
    return `vals_macro_${tableCounter}_${Date.now()}`;
  }

  function makeStatsTable() {
    return makeTable({
      distinct_count: 20,
      min_val: 0,
      max_val: 100,
      mean_val: 50,
      stddev_val: 15
    });
  }

  function makeBreaksTable(breaks: unknown) {
    return makeTable({ breaks });
  }

  function makeCountsTable() {
    return makeTable({
      cnt_0: 4,
      cnt_1: 6,
      cnt_2: 5,
      cnt_3: 3,
      cnt_4: 2
    });
  }

  function arrangeMacroFlow(
    rawBreaks: unknown,
    rounded?: unknown
  ): { tableName: string } {
    const tableName = uniqueTable();
    mockedGetDatasetBySourceFile.mockReturnValue({ tableName } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(makeStatsTable() as never)
      .mockResolvedValueOnce(makeBreaksTable(rawBreaks) as never)
      .mockResolvedValueOnce(
        makeTable({ rounded: rounded ?? rawBreaks }) as never
      )
      .mockResolvedValueOnce(makeCountsTable() as never)
      .mockResolvedValueOnce(makeTable({ bounds: [0, 100] }) as never);
    return { tableName };
  }

  it.each([
    ['quantiles', 'quantile('],
    ['equal_interval', 'equi_width('],
    ['q6', 'q6('],
    ['nested_means', 'nested_means('],
    ['head_tail', 'headtail2(']
  ])(
    'should invoke the %s macro (%s) and parse a plain-array result',
    async (method, macroFragment) => {
      arrangeMacroFlow([20, 40, 60, 80]);

      const result = await calculateBreaks({
        datasetId: 'src',
        columnName: 'value',
        method: method as never,
        numClasses: 5
      });

      expect(result?.breaks).toEqual([20, 40, 60, 80]);
      expect(result?.counts).toEqual([4, 6, 5, 3, 2]);
      const macroQuery = mockedDuckQuery.mock.calls[1]?.[0] as string;
      expect(macroQuery).toContain(macroFragment);
    }
  );

  it('should parse results when the macro returns a TypedArray (iterable but not Array)', async () => {
    const typedArrayBreaks = Float64Array.of(20, 40, 60, 80);
    expect(Array.isArray(typedArrayBreaks)).toBe(false);
    expect(typeof typedArrayBreaks[Symbol.iterator]).toBe('function');

    arrangeMacroFlow(typedArrayBreaks, typedArrayBreaks);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });

  it('should keep raw breaks and log when break rounding fails', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: uniqueTable()
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(makeStatsTable() as never)
      .mockResolvedValueOnce(makeBreaksTable([20, 40, 60, 80]) as never)
      .mockRejectedValueOnce(new Error('rounding failed'))
      .mockResolvedValueOnce(makeCountsTable() as never);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
    expect(mockedLoggerWarn).toHaveBeenCalledWith(
      'Failed to round classification breaks; using unrounded breaks',
      'DATA',
      expect.objectContaining({
        error: expect.any(Error),
        flow: 'classification_breaks',
        extra: expect.objectContaining({
          columnName: 'value',
          breakCount: 4
        })
      })
    );
  });

  it('should return null when the DuckDB macro returns null', async () => {
    arrangeMacroFlow(null, null);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result).toBeNull();
    expect(mockedDuckQuery).toHaveBeenCalledTimes(2);
  });

  it('should return null when the DuckDB macro throws', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: uniqueTable()
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(makeStatsTable() as never)
      .mockRejectedValueOnce(new Error('macro failure') as never);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result).toBeNull();
    expect(mockedDuckQuery).toHaveBeenCalledTimes(2);
  });

  it('should filter out macro values outside the [min, max] range', async () => {
    arrangeMacroFlow([-50, 20, 60, 500]);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 60]);
  });

  it('should not invoke any macro query for manual method inside calculateBreaks', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: uniqueTable()
    } as never);
    mockedDuckQuery.mockResolvedValueOnce(makeStatsTable() as never);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'manual' as never,
      numClasses: 5
    });

    expect(result).toBeNull();
    const queries = mockedDuckQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.every((q) => !q.includes('quantile('))).toBe(true);
    expect(queries.every((q) => !q.includes('kmeans('))).toBe(true);
    expect(queries.every((q) => !q.includes('round_thresholds('))).toBe(true);
  });
});

describe('calculateBreaks — rounding never changes the class count', () => {
  let roundingCounter = 0;

  function arrangeRoundingFlow(rawBreaks: number[], rounded: unknown): string {
    roundingCounter += 1;
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: `vals_rounding_${roundingCounter}`
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({ distinct_count: 400, min_val: 0, max_val: 27367 }) as never
      )
      .mockResolvedValueOnce(makeTable({ breaks: rawBreaks }) as never)
      .mockResolvedValueOnce(makeTable({ rounded }) as never)
      .mockResolvedValueOnce(
        makeTable({ cnt_0: 9, cnt_1: 4, cnt_2: 2, cnt_3: 1 }) as never
      )
      .mockResolvedValueOnce(makeTable({ bounds: [0, 27367] }) as never);
    return `births_${roundingCounter}`;
  }

  it('keeps the unrounded thresholds when two of them round onto the same value', async () => {
    const columnName = arrangeRoundingFlow(
      [3909, 16420, 21894],
      [4000, 20000, 20000]
    );

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName,
      method: ClassificationMethod.EQUAL_INTERVAL,
      numClasses: 4
    });

    expect(result?.breaks).toEqual([3909, 16420, 21894]);
    expect(result?.counts).toHaveLength(4);
    expect(mockedLoggerWarn).toHaveBeenCalledWith(
      'Discarded rounded classification breaks that would change the class count',
      'DATA',
      expect.objectContaining({
        extra: expect.objectContaining({ breakCount: 3, roundedCount: 2 })
      })
    );
  });

  it('keeps the unrounded thresholds when rounding lands one of them on the minimum', async () => {
    const columnName = arrangeRoundingFlow(
      [3909, 16420, 21894],
      [0, 20000, 23000]
    );

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName,
      method: ClassificationMethod.EQUAL_INTERVAL,
      numClasses: 4
    });

    expect(result?.breaks).toEqual([3909, 16420, 21894]);
  });

  it('adopts the rounded thresholds when they stay as numerous as the originals', async () => {
    const columnName = arrangeRoundingFlow(
      [3909, 16420, 21894],
      [4000, 16000, 22000]
    );

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName,
      method: ClassificationMethod.EQUAL_INTERVAL,
      numClasses: 4
    });

    expect(result?.breaks).toEqual([4000, 16000, 22000]);
    expect(mockedLoggerWarn).not.toHaveBeenCalled();
  });
});

describe('calculateBreaks — rounded scale bounds', () => {
  let boundsCounter = 0;

  function arrangeBoundsFlow(bounds: unknown): string {
    boundsCounter += 1;
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: `vals_bounds_${boundsCounter}`
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({ distinct_count: 400, min_val: 3, max_val: 27367 }) as never
      )
      .mockResolvedValueOnce(makeTable({ breaks: [4000, 16000] }) as never)
      .mockResolvedValueOnce(makeTable({ rounded: [4000, 16000] }) as never)
      .mockResolvedValueOnce(
        makeTable({ cnt_0: 9, cnt_1: 4, cnt_2: 2 }) as never
      );

    if (bounds !== undefined) {
      mockedDuckQuery.mockResolvedValueOnce(makeTable({ bounds }) as never);
    }

    return `births_bounds_${boundsCounter}`;
  }

  it('exposes the rounded bounds next to the raw ones', async () => {
    const columnName = arrangeBoundsFlow([3, 27000]);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName,
      method: ClassificationMethod.EQUAL_INTERVAL,
      numClasses: 3
    });

    expect(result?.min).toBe(3);
    expect(result?.max).toBe(27367);
    expect(result?.roundedMin).toBe(3);
    expect(result?.roundedMax).toBe(27000);
    expect(mockedDuckQuery.mock.calls[4]?.[0]).toContain('round_bounds');
  });

  it('keeps a raw bound when its rounding would cross the adjacent threshold', async () => {
    const columnName = arrangeBoundsFlow([5000, 15000]);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName,
      method: ClassificationMethod.EQUAL_INTERVAL,
      numClasses: 3
    });

    expect(result?.roundedMin).toBe(3);
    expect(result?.roundedMax).toBe(27367);
  });

  it('falls back to the raw bounds and logs when the bounds query fails', async () => {
    const columnName = arrangeBoundsFlow(undefined);
    mockedDuckQuery.mockRejectedValueOnce(new Error('boom') as never);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName,
      method: ClassificationMethod.EQUAL_INTERVAL,
      numClasses: 3
    });

    expect(result?.roundedMin).toBe(3);
    expect(result?.roundedMax).toBe(27367);
    expect(mockedLoggerWarn).toHaveBeenCalledWith(
      'Failed to round classification bounds; using unrounded bounds',
      'DATA',
      expect.objectContaining({ flow: 'classification_breaks' })
    );
  });
});

describe('calculateBreaks — Head/Tail natural class count', () => {
  let headTailCounter = 0;

  function arrangeHeadTailFlow(
    ladder: number[],
    counts: Record<string, number>
  ): void {
    headTailCounter += 1;
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: `vals_head_tail_${headTailCounter}`
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({ distinct_count: 500, min_val: 0, max_val: 30000 }) as never
      )
      .mockResolvedValueOnce(makeTable({ breaks: ladder }) as never)
      .mockResolvedValueOnce(makeTable({ rounded: ladder }) as never)
      .mockResolvedValueOnce(makeTable(counts) as never)
      .mockResolvedValueOnce(makeTable({ bounds: [0, 30000] }) as never);
  }

  it('reports the whole ladder as the natural count when fewer classes are requested', async () => {
    arrangeHeadTailFlow([21, 127, 515, 1349, 2890, 7717, 20078], {
      cnt_0: 30000,
      cnt_1: 4000,
      cnt_2: 900,
      cnt_3: 53
    });

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'births',
      method: ClassificationMethod.HEAD_TAIL,
      numClasses: 4
    });

    expect(result?.breaks).toEqual([21, 127, 515]);
    expect(result?.counts).toHaveLength(4);
    // Lowering the request must not shrink the ceiling the UI offers back.
    expect(result?.naturalClassCount).toBe(8);
    const macroQuery = mockedDuckQuery.mock.calls[1]?.[0] as string;
    expect(macroQuery).toContain('headtail2(');
    expect(macroQuery).toContain(', 12)');
  });

  it('reports two classes when the algorithm stops after the first split', async () => {
    arrangeHeadTailFlow([52], { cnt_0: 19000, cnt_1: 15000 });

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'region_code',
      method: ClassificationMethod.HEAD_TAIL,
      numClasses: 6
    });

    expect(result?.breaks).toEqual([52]);
    expect(result?.naturalClassCount).toBe(2);
  });

  it('leaves the natural count unset for methods that honour the request', async () => {
    arrangeHeadTailFlow([21, 127, 515], {
      cnt_0: 30000,
      cnt_1: 4000,
      cnt_2: 900,
      cnt_3: 53
    });

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'births',
      method: ClassificationMethod.QUANTILES,
      numClasses: 4
    });

    expect(result?.breaks).toEqual([21, 127, 515]);
    expect(result?.naturalClassCount).toBeUndefined();
  });
});

describe('calculateBreaks — Flechette edge cases', () => {
  let edgeCounter = 0;

  function uniqueTable(): string {
    edgeCounter += 1;
    return `vals_edge_${edgeCounter}_${Date.now()}`;
  }

  function makeStatsTable() {
    return makeTable({
      distinct_count: 20,
      min_val: 0,
      max_val: 100,
      mean_val: 50,
      stddev_val: 15
    });
  }

  function makeCountsTable() {
    return makeTable({
      cnt_0: 4,
      cnt_1: 6,
      cnt_2: 5,
      cnt_3: 3,
      cnt_4: 2
    });
  }

  function arrangeMacroFlow(rawBreaks: unknown, rounded?: unknown) {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: uniqueTable()
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(makeStatsTable() as never)
      .mockResolvedValueOnce(makeTable({ breaks: rawBreaks }) as never)
      .mockResolvedValueOnce(
        makeTable({ rounded: rounded ?? rawBreaks }) as never
      )
      .mockResolvedValueOnce(makeCountsTable() as never)
      .mockResolvedValueOnce(makeTable({ bounds: [0, 100] }) as never);
  }

  it('should filter null entries when the macro returns an Array with nulls (Flechette fallback slice with null bitmap)', async () => {
    arrangeMacroFlow([null, 20, null, 60, null]);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 60]);
  });

  it('should coerce BigInt entries produced by Int64Batch-like lists', async () => {
    arrangeMacroFlow([20n, 40n, 60n, 80n], [20n, 40n, 60n, 80n]);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });
});

describe('suggestClassificationDefaults', () => {
  it('keeps the base method and class count for balanced distributions', () => {
    const result = suggestClassificationDefaults({
      method: ClassificationMethod.KMEANS,
      classes: 4,
      skewness: 0.4,
      rowCount: 300
    });
    expect(result).toEqual({ method: ClassificationMethod.KMEANS, classes: 4 });
  });

  it('switches to head/tail for heavy right-tailed distributions', () => {
    const result = suggestClassificationDefaults({
      method: ClassificationMethod.KMEANS,
      classes: 4,
      skewness: 4.5,
      rowCount: 300
    });
    expect(result.method).toBe(ClassificationMethod.HEAD_TAIL);
  });

  it('switches to quantiles for moderately skewed distributions (both signs)', () => {
    expect(
      suggestClassificationDefaults({
        method: ClassificationMethod.KMEANS,
        classes: 4,
        skewness: 2,
        rowCount: 300
      }).method
    ).toBe(ClassificationMethod.QUANTILES);
    expect(
      suggestClassificationDefaults({
        method: ClassificationMethod.KMEANS,
        classes: 4,
        skewness: -2,
        rowCount: 300
      }).method
    ).toBe(ClassificationMethod.QUANTILES);
  });

  it('caps the class count to a third of the entity count', () => {
    const result = suggestClassificationDefaults({
      method: ClassificationMethod.KMEANS,
      classes: 4,
      rowCount: 10
    });
    expect(result.classes).toBe(3);
  });

  it('never drops below two classes and never touches manual classifications', () => {
    expect(
      suggestClassificationDefaults({
        method: ClassificationMethod.KMEANS,
        classes: 4,
        rowCount: 4
      }).classes
    ).toBe(2);
    expect(
      suggestClassificationDefaults({
        method: ClassificationMethod.MANUAL,
        classes: 5,
        skewness: 5,
        rowCount: 300
      }).method
    ).toBe(ClassificationMethod.MANUAL);
  });
});
