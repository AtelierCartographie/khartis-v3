import { describe, expect, it, vi } from 'vitest';

vi.mock('@ateliercartographie/ok-palette', () => ({
  sequential: ({ steps }: { steps: number }) =>
    Array.from(
      { length: steps },
      (_, i) => `#${i.toString(16).padStart(2, '0')}0000`
    ),
  divergentSequential: ({
    steps,
    hasCenterClass
  }: {
    steps: [number, number];
    hasCenterClass: boolean;
  }) => {
    const total = steps[0] + steps[1] + (hasCenterClass ? 1 : 0);
    return Array.from(
      { length: total },
      (_, i) => `#00${i.toString(16).padStart(2, '0')}00`
    );
  },
  resolvePalette: (colors: string[]) =>
    colors.map(() => [128, 128, 128, 255] as [number, number, number, number])
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: vi.fn() }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: { getDatasetBySourceFile: vi.fn() }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: {
    EQUAL_INTERVAL: 'equal_interval',
    QUANTILES: 'quantiles',
    JENKS: 'jenks',
    MANUAL: 'manual',
    STANDARD_DEVIATION: 'standard_deviation',
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
  applyPaletteInversion,
  calculateBreakCounts,
  calculateBreaks,
  generateColorsForBreaks
} from '$lib/features/commons/services/classification.service';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const mockedDuckQuery = vi.mocked(Duck.query);
const mockedGetDatasetBySourceFile = vi.mocked(
  duckDBOrchestrator.getDatasetBySourceFile
);

function makeTable(row: Record<string, unknown>) {
  return {
    numRows: 1,
    getChild: (name: string) => ({
      get: () => row[name]
    })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateColorsForBreaks — sequential', () => {
  it('returns array of length numClasses with valid hex values', () => {
    const colors = generateColorsForBreaks(5);
    expect(colors).toHaveLength(5);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('clamps numClasses below 2 to 2', () => {
    expect(generateColorsForBreaks(1)).toHaveLength(2);
    expect(generateColorsForBreaks(0)).toHaveLength(2);
  });

  it('works for large class counts', () => {
    const colors = generateColorsForBreaks(9);
    expect(colors).toHaveLength(9);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('sequential is the default palette', () => {
    expect(generateColorsForBreaks(4, 'sequential')).toEqual(
      generateColorsForBreaks(4)
    );
  });
});

describe('generateColorsForBreaks — diverging', () => {
  it('returns array of length numClasses for even count', () => {
    const colors = generateColorsForBreaks(4, 'diverging');
    expect(colors).toHaveLength(4);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('returns array of length numClasses for odd count (center class)', () => {
    const colors = generateColorsForBreaks(5, 'diverging');
    expect(colors).toHaveLength(5);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('honours an asymmetric divergingSplit (lower < upper)', () => {
    const colors = generateColorsForBreaks(5, 'diverging', undefined, {
      lowerCount: 1,
      upperCount: 3,
      hasCenterClass: true
    });
    expect(colors).toHaveLength(5);
  });

  it('honours an asymmetric divergingSplit (lower > upper)', () => {
    const colors = generateColorsForBreaks(5, 'diverging', undefined, {
      lowerCount: 3,
      upperCount: 1,
      hasCenterClass: true
    });
    expect(colors).toHaveLength(5);
  });

  it('honours an asymmetric divergingSplit without a centre class', () => {
    const colors = generateColorsForBreaks(5, 'diverging', undefined, {
      lowerCount: 2,
      upperCount: 3,
      hasCenterClass: false
    });
    expect(colors).toHaveLength(5);
  });

  it('falls back to symmetric split when divergingSplit is omitted', () => {
    const colors = generateColorsForBreaks(4, 'diverging');
    expect(colors).toHaveLength(4);
  });
});

describe('applyPaletteInversion', () => {
  const palette = ['#ff0000', '#00ff00', '#0000ff'];

  it('returns the same reference when not inverted', () => {
    expect(applyPaletteInversion(palette, false)).toBe(palette);
  });

  it('defaults to not inverted', () => {
    expect(applyPaletteInversion(palette)).toBe(palette);
  });

  it('returns reversed array when inverted', () => {
    expect(applyPaletteInversion(palette, true)).toEqual([
      '#0000ff',
      '#00ff00',
      '#ff0000'
    ]);
  });

  it('does not mutate the original when inverted', () => {
    const original = [...palette];
    applyPaletteInversion(palette, true);
    expect(palette).toEqual(original);
  });

  it('handles empty array', () => {
    expect(applyPaletteInversion([], true)).toEqual([]);
  });
});

describe('calculateBreaks', () => {
  it('computes standard deviation breaks without falling back to nested means', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: 'vals_stddev_test'
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(
        makeTable({
          distinct_count: 9,
          min_val: 0,
          max_val: 100,
          mean_val: 50,
          stddev_val: 10
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          rounded: [35, 45, 55, 65]
        }) as never
      )
      .mockResolvedValueOnce(
        makeTable({
          cnt_0: 1,
          cnt_1: 2,
          cnt_2: 3,
          cnt_3: 2,
          cnt_4: 1
        }) as never
      );

    const result = await calculateBreaks({
      datasetId: 'source-stddev',
      columnName: 'value',
      method: 'standard_deviation' as never,
      numClasses: 5
    });

    expect(result).toEqual({
      breaks: [35, 45, 55, 65],
      counts: [1, 2, 3, 2, 1],
      min: 0,
      max: 100
    });
    expect(mockedDuckQuery.mock.calls[0]?.[0]).toContain('STDDEV_SAMP');
    expect(mockedDuckQuery.mock.calls[1]?.[0]).toContain('round_thresholds');
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
          max_val: 100,
          mean_val: 50,
          stddev_val: 10
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
      .mockResolvedValueOnce(makeCountsTable() as never);
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

  it('should parse results when the macro returns a generic iterable (Arrow Vector-like)', async () => {
    const vectorLike: Iterable<number> = {
      *[Symbol.iterator]() {
        yield 20;
        yield 40;
        yield 60;
        yield 80;
      }
    };
    expect(Array.isArray(vectorLike)).toBe(false);

    arrangeMacroFlow(vectorLike, [20, 40, 60, 80]);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });

  it('should fall back to equal-interval breaks when the macro returns null', async () => {
    arrangeMacroFlow(null, null);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
    expect(result?.min).toBe(0);
    expect(result?.max).toBe(100);
  });

  it('should fall back to equal-interval breaks when the macro throws', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: uniqueTable()
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(makeStatsTable() as never)
      .mockRejectedValueOnce(new Error('macro failure') as never)
      .mockResolvedValueOnce(makeTable({ rounded: [20, 40, 60, 80] }) as never)
      .mockResolvedValueOnce(makeCountsTable() as never);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
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

  it('should use rounded breaks from round_thresholds when it returns a TypedArray', async () => {
    arrangeMacroFlow(
      Float64Array.of(23.7, 47.2, 61.9, 84.1),
      Float64Array.of(25, 50, 60, 85)
    );

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([25, 50, 60, 85]);
    const roundQuery = mockedDuckQuery.mock.calls[2]?.[0] as string;
    expect(roundQuery).toContain('round_thresholds(');
  });

  it('should not invoke any macro query for manual method (falls back to equal-interval inside calculateBreaks)', async () => {
    mockedGetDatasetBySourceFile.mockReturnValue({
      tableName: uniqueTable()
    } as never);
    mockedDuckQuery
      .mockResolvedValueOnce(makeStatsTable() as never)
      .mockResolvedValueOnce(makeCountsTable() as never);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'manual' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
    const queries = mockedDuckQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.every((q) => !q.includes('quantile('))).toBe(true);
    expect(queries.every((q) => !q.includes('kmeans('))).toBe(true);
    expect(queries.every((q) => !q.includes('round_thresholds('))).toBe(true);
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
      .mockResolvedValueOnce(makeCountsTable() as never);
  }

  it('should fall back to equal-interval when the macro returns an empty list (DirectBatch subarray of length 0)', async () => {
    arrangeMacroFlow(new Float64Array(0), new Float64Array(0));

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });

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

  it('should parse a Float32Array subarray (DirectBatch for single-precision list)', async () => {
    const f32 = Float32Array.of(20, 40, 60, 80).subarray(0, 4);
    expect(f32).toBeInstanceOf(Float32Array);
    expect(Array.isArray(f32)).toBe(false);
    arrangeMacroFlow(f32, f32);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });

  it('should parse an Int32Array subarray (DirectBatch for integer-typed list)', async () => {
    arrangeMacroFlow(
      Int32Array.of(20, 40, 60, 80),
      Int32Array.of(20, 40, 60, 80)
    );

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'equal_interval' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });

  it('should treat undefined get(0) the same as null (out-of-range row)', async () => {
    arrangeMacroFlow(undefined, undefined);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
  });

  it('should ignore unsupported scalar return (e.g. macro misconfigured to return a number)', async () => {
    arrangeMacroFlow(42, 42);

    const result = await calculateBreaks({
      datasetId: 'src',
      columnName: 'value',
      method: 'quantiles' as never,
      numClasses: 5
    });

    expect(result?.breaks).toEqual([20, 40, 60, 80]);
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
