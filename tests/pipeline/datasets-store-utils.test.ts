import { describe, expect, it, vi } from 'vitest';
import {
  getColumnValues,
  getColumnStatistics,
  getUniqueValues
} from '$lib/features/commons/store/datasets/datasets-statistics';
import {
  getSourceFileIndex,
  cleanFileForStorage
} from '$lib/features/commons/store/project/project-files';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  LogCategory: { PROJECT: 'PROJECT', DATA: 'DATA' }
}));
vi.mock(
  '$lib/features/commons/services/data-orchestrator.service.svelte',
  () => ({
    dataOrchestratorService: { onFileAdded: vi.fn(), onFileRemoved: vi.fn() }
  })
);
vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: { notifyChange: vi.fn(), register: vi.fn() },
  SavePriority: { DEBOUNCED: 'DEBOUNCED', IMMEDIATE: 'IMMEDIATE' }
}));
vi.mock('$lib/features/commons/store/project/project-persistence', () => ({
  markDirtyAndSave: vi.fn().mockResolvedValue(undefined)
}));

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

// ─── getColumnValues ───────────────────────────────────────────────────────

describe('getColumnValues', () => {
  it('returns [] when dataset is missing', () => {
    const state = makeState([]);
    expect(getColumnValues(state as never, 'missing', 'col')).toEqual([]);
  });

  it('returns [] when dataset has no data', () => {
    const state = makeState([
      makeDataset('d1', [{ name: 'pop', type: 'number' }])
    ]);
    expect(getColumnValues(state as never, 'd1', 'pop')).toEqual([]);
  });

  it('extracts column values from data rows', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'pop', type: 'number' }],
        [{ pop: 100 }, { pop: 200 }, { pop: 300 }]
      )
    ]);
    expect(getColumnValues(state as never, 'd1', 'pop')).toEqual([
      100, 200, 300
    ]);
  });

  it('includes null values', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'val', type: 'number' }],
        [{ val: 1 }, { val: null }, { val: 3 }]
      )
    ]);
    expect(getColumnValues(state as never, 'd1', 'val')).toEqual([1, null, 3]);
  });
});

// ─── getUniqueValues ───────────────────────────────────────────────────────

describe('getUniqueValues', () => {
  it('deduplicates repeated values', () => {
    const state = makeState([
      makeDataset(
        'd1',
        [{ name: 'cat', type: 'string' }],
        [{ cat: 'A' }, { cat: 'B' }, { cat: 'A' }, { cat: 'C' }]
      )
    ]);
    const result = getUniqueValues(state as never, 'd1', 'cat');
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(['A', 'B', 'C']));
  });

  it('returns [] when dataset is missing', () => {
    expect(getUniqueValues(makeState() as never, 'x', 'y')).toEqual([]);
  });
});

// ─── getColumnStatistics ───────────────────────────────────────────────────

describe('getColumnStatistics — missing inputs', () => {
  it('returns null when dataset not found', () => {
    expect(
      getColumnStatistics(makeState() as never, 'missing', 'col')
    ).toBeNull();
  });

  it('returns null when column not found', () => {
    const state = makeState([
      makeDataset('d1', [{ name: 'pop', type: 'number' }])
    ]);
    expect(getColumnStatistics(state as never, 'd1', 'nonexistent')).toBeNull();
  });
});

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
});

// ─── getSourceFileIndex ────────────────────────────────────────────────────

describe('getSourceFileIndex', () => {
  const makeContainer = (files: { id: string }[]) => ({
    _state: {
      currentProject: {
        data: { sourceFiles: files }
      }
    }
  });

  it('returns the correct index for a matching file id', () => {
    const container = makeContainer([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]);
    expect(getSourceFileIndex(container as never, 'f2')).toBe(1);
  });

  it('returns -1 when file id is not found', () => {
    const container = makeContainer([{ id: 'f1' }]);
    expect(getSourceFileIndex(container as never, 'missing')).toBe(-1);
  });

  it('returns -1 when currentProject is null', () => {
    const container = { _state: { currentProject: null } };
    expect(getSourceFileIndex(container as never, 'f1')).toBe(-1);
  });

  it('returns -1 when sourceFiles is absent', () => {
    const container = { _state: { currentProject: { data: {} } } };
    expect(getSourceFileIndex(container as never, 'f1')).toBe(-1);
  });
});

// ─── cleanFileForStorage ───────────────────────────────────────────────────

describe('cleanFileForStorage', () => {
  it('preserves all declared fields', () => {
    const file = {
      id: 'f1',
      name: 'data.csv',
      size: 1024,
      type: 'text/csv',
      fileType: 'CSV' as never,
      status: 'ready' as never,
      uploadProgress: 100,
      errorMessage: undefined,
      validation: undefined,
      parsedData: undefined,
      content: new ArrayBuffer(8),
      preparedGeoJSON: undefined,
      duplicates: undefined,
      statistics: undefined,
      sourceType: 'local' as never,
      deepAnalysis: undefined,
      geoMatchResult: undefined,
      relatedFiles: undefined,
      relatedFilesData: undefined,
      columnTransformations: [],
      duckdbTableName: 'tbl',
      sourceArchive: undefined,
      extraField: 'should_be_stripped'
    };
    const result = cleanFileForStorage(file as never);
    expect(result.id).toBe('f1');
    expect(result.name).toBe('data.csv');
    expect(result.duckdbTableName).toBe('tbl');
    expect(
      (result as unknown as Record<string, unknown>).extraField
    ).toBeUndefined();
  });

  it('does not mutate the original file', () => {
    const file = {
      id: 'f1',
      name: 'data.csv',
      size: 0,
      type: '',
      fileType: 'CSV' as never,
      status: 'ready' as never,
      uploadProgress: 0,
      content: undefined
    } as never;
    const result = cleanFileForStorage(file);
    expect(result).not.toBe(file);
  });
});
