import { describe, expect, it } from 'vitest';
import { getColumnStatistics } from '$lib/features/commons/stores/datasets/datasets-statistics';

function makeState(datasets: ReturnType<typeof makeDataset>[] = []) {
  return {
    datasets,
    enabledDatasetIds: new Set<string>(),
    isProcessing: false,
    hiddenColumns: new Map<string, Set<string>>()
  };
}

function makeDataset(
  id: string,
  columns: {
    name: string;
    type: string;
    min?: unknown;
    max?: unknown;
    mean?: number;
    median?: number;
    count?: number;
    nulls?: number;
    uniques?: number;
  }[],
  data: Record<string, unknown>[] = []
) {
  return {
    id,
    name: id,
    sourceFileId: `s-${id}`,
    tableName: `t_${id}`,
    columns: columns.map((c) => ({
      name: c.name,
      type: c.type,
      values: [],
      stats: {
        name: c.name,
        type: c.type,
        count: c.count ?? data.length,
        nulls: c.nulls ?? 0,
        uniques:
          c.uniques ??
          new Set(
            data
              .map((r) => r[c.name])
              .filter((v) => v !== null && v !== undefined)
          ).size,
        ...(c.min !== undefined ? { min: c.min } : {}),
        ...(c.max !== undefined ? { max: c.max } : {}),
        ...(c.mean !== undefined ? { mean: c.mean } : {}),
        ...(c.median !== undefined ? { median: c.median } : {})
      }
    })),
    rowCount: data.length,
    metadata: { processedAt: new Date(), fileType: 'csv', parserUsed: 'test' },
    data
  };
}

// ─── getColumnStatistics ───────────────────────────────────────────────────

describe('getColumnStatistics — numeric fast path (uses column.stats)', () => {
  it('returns NumericStatistics from column.stats when min/max present', () => {
    const state = makeState([
      makeDataset('d1', [
        {
          name: 'pop',
          type: 'number',
          min: 10,
          max: 500,
          mean: 200,
          median: 180,
          count: 50,
          nulls: 2
        }
      ])
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'pop');
    expect(result).toMatchObject({
      min: 10,
      max: 500,
      mean: 200,
      median: 180,
      count: 50,
      nullCount: 2
    });
  });

  it('falls through to data computation when stats.min is missing', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'val', type: 'number' }],
        [{ val: 4 }, { val: 2 }, { val: 6 }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'val') as {
      min: number;
      max: number;
    };
    expect(result.min).toBe(2);
    expect(result.max).toBe(6);
  });
});

describe('getColumnStatistics — numeric fallback (computed from data)', () => {
  it('computes min/max/mean from number rows', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: 1 }, { v: 3 }, { v: 5 }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      min: number;
      max: number;
      mean: number;
    };
    expect(result.min).toBe(1);
    expect(result.max).toBe(5);
    expect(result.mean).toBeCloseTo(3);
  });

  it('computes median for odd-length array', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: 5 }, { v: 1 }, { v: 3 }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      median: number;
    };
    expect(result.median).toBe(3);
  });

  it('computes median for even-length array (average of two middle values)', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      median: number;
    };
    expect(result.median).toBe(2.5);
  });

  it('counts nulls and excludes them from numeric computation', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: 10 }, { v: null }, { v: 20 }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      count: number;
      nullCount: number;
    };
    expect(result.count).toBe(2);
    expect(result.nullCount).toBe(1);
  });

  it('counts configured null tokens in the legacy numeric fallback', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: 10 }, { v: 'NA' }, { v: 'none' }, { v: '-' }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      count: number;
      nullCount: number;
      min: number;
      max: number;
    };
    expect(result.count).toBe(1);
    expect(result.nullCount).toBe(3);
    expect(result.min).toBe(10);
    expect(result.max).toBe(10);
  });

  it('parses BigInt values as numbers', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: BigInt(100) }, { v: BigInt(200) }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      min: number;
      max: number;
    };
    expect(result.min).toBe(100);
    expect(result.max).toBe(200);
  });

  it('parses string numbers with comma as decimal separator', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: '1,5' }, { v: '2,5' }]
      )
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      min: number;
      max: number;
    };
    expect(result.min).toBe(1.5);
    expect(result.max).toBe(2.5);
  });

  it('parses string numbers with non-breaking spaces as thousands separators', () => {
    const state = makeState([
      makeDataset('d1', [{ name: 'v', type: 'number' }], [{ v: '1\u00A0234' }])
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'v') as {
      min: number;
    };
    expect(result.min).toBe(1234);
  });

  it('returns null when all values are non-parseable', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'v', type: 'number' }],
        [{ v: 'abc' }, { v: null }]
      )
    ]);
    expect(getColumnStatistics(state as never, 'd1', 'v')).toBeNull();
  });
});

describe('getColumnStatistics — categorical', () => {
  it('returns CategoricalStatistics from column.stats when available', () => {
    const state = makeState([
      makeDataset('d1', [
        { name: 'cat', type: 'string', count: 100, nulls: 5, uniques: 12 }
      ])
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'cat') as {
      uniqueCount: number;
      count: number;
      nullCount: number;
    };
    expect(result.uniqueCount).toBe(12);
    expect(result.count).toBe(100);
    expect(result.nullCount).toBe(5);
  });

  it('computes categorical stats from data when column.stats is absent', () => {
    const state = makeState([
      {
        id: 'd1',
        name: 'd1',
        sourceFileId: 's',
        tableName: 't',
        rowCount: 4,
        metadata: {
          processedAt: new Date(),
          fileType: 'csv',
          parserUsed: 'test'
        },
        columns: [
          { name: 'cat', type: 'string', values: [], stats: null as never }
        ],
        data: [{ cat: 'A' }, { cat: 'B' }, { cat: 'A' }, { cat: null }]
      }
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'cat') as {
      uniqueCount: number;
      nullCount: number;
    };
    expect(result.uniqueCount).toBe(2);
    expect(result.nullCount).toBe(1);
  });

  it('counts configured null tokens in the legacy categorical fallback', () => {
    const state = makeState([
      {
        id: 'd1',
        name: 'd1',
        sourceFileId: 's',
        tableName: 't',
        rowCount: 4,
        metadata: {
          processedAt: new Date(),
          fileType: 'csv',
          parserUsed: 'test'
        },
        columns: [
          { name: 'cat', type: 'string', values: [], stats: null as never }
        ],
        data: [{ cat: 'A' }, { cat: 'NA' }, { cat: 'none' }, { cat: '-' }]
      }
    ]);
    const result = getColumnStatistics(state as never, 'd1', 'cat') as {
      uniqueCount: number;
      nullCount: number;
    };
    expect(result.uniqueCount).toBe(1);
    expect(result.nullCount).toBe(3);
  });
});
