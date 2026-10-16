import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { breaks as breaksMacros } from '$lib/features/duckdb/macros/breaks';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const state = vi.hoisted(() => ({ db: null as TestDuckDB | null }));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: async (sql: string) => {
      const rows = await query(state.db!, sql);
      return {
        numRows: rows.length,
        getChild: (name: string) => ({
          get: (index: number) => rows[index]?.[name]
        })
      };
    }
  },
  GEO_CONSTANTS: { WGS84_CRS: 'EPSG:4326', WEB_MERCATOR_CRS: 'EPSG:3857' }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ClassificationMethod: { EQUAL_INTERVAL: 'equal_interval' }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: () => ({ tableName: 'collection' }),
    datasetsVersion: 1
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  LogCategory: { DATA: 'DATA', DUCKDB: 'DUCKDB' }
}));

import {
  calculateBreakCounts,
  calculateBreaks,
  calculateCalendarBreakCounts,
  calculateCalendarBreaks,
  isTemporalColumn,
  detectDivergingBreakpoint
} from '$lib/features/commons/services/classification.service';
import type { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';

const EQUAL_INTERVAL = 'equal_interval' as ClassificationMethod;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

beforeAll(async () => {
  state.db = await createTestInstance();
  await state.db.connection.run(breaksMacros);
  await run(
    state.db,
    "CREATE TABLE collection AS SELECT i::DOUBLE AS y1960, (i + 90)::INTEGER AS y2020, i::DOUBLE AS gain, (-i)::DOUBLE AS loss, DATE '2020-03-15' + (i * 40)::INTEGER AS d2020, DATE '2023-01-01' + (i * 40)::INTEGER AS d2023, TIMESTAMPTZ '2021-06-29 23:30:00+00' + to_days(i::INTEGER) AS ts FROM range(1, 11) t(i)"
  );
});

afterAll(async () => {
  await destroyTestInstance(state.db!);
});

describe('calculateBreaks over pooled columns', () => {
  it('classifies the values of every pooled column on one scale', async () => {
    const pooled = await calculateBreaks({
      datasetId: 'source',
      columnName: 'y1960',
      method: EQUAL_INTERVAL,
      numClasses: 2,
      pooledColumnNames: ['y1960', 'y2020']
    });

    expect(pooled).toMatchObject({ min: 1, max: 100, counts: [10, 10] });
    expect(pooled?.breaks).toHaveLength(1);
    expect(pooled!.breaks[0]).toBeGreaterThan(10);
    expect(pooled!.breaks[0]).toBeLessThanOrEqual(91);
  });

  it('keeps each column on its own scale without pooling', async () => {
    const own = await calculateBreaks({
      datasetId: 'source',
      columnName: 'y1960',
      method: EQUAL_INTERVAL,
      numClasses: 2
    });

    expect(own).toMatchObject({ min: 1, max: 10 });
  });

  it('counts manual classes over the pooled columns', async () => {
    const counted = await calculateBreakCounts({
      datasetId: 'source',
      columnName: 'y1960',
      breaks: [50],
      pooledColumnNames: ['y1960', 'y2020']
    });

    expect(counted?.counts).toEqual([10, 10]);
  });

  it('detects a zero pivot only when the pooled values cross zero', async () => {
    const own = await detectDivergingBreakpoint({
      datasetId: 'source',
      columnName: 'gain'
    });
    const pooled = await detectDivergingBreakpoint({
      datasetId: 'source',
      columnName: 'gain',
      pooledColumnNames: ['gain', 'loss']
    });

    expect(own).toBeNull();
    expect(pooled).toBe(0);
  });

  it('should return a single class without breaks when the scoped series holds one value', async () => {
    const single = await calculateBreaks({
      datasetId: 'source',
      columnName: 'y1960',
      method: EQUAL_INTERVAL,
      numClasses: 5,
      rowScopeClause: '"y1960" = 3'
    });

    expect(single).toEqual({
      breaks: [],
      counts: [1],
      min: 3,
      max: 3,
      roundedMin: 3,
      roundedMax: 3
    });
  });

  it('should cut a DATE column on calendar boundaries and count every value once', async () => {
    // 2020-04-24 … 2021-04-09
    const result = await calculateCalendarBreaks({
      datasetId: 'source',
      columnName: 'd2020',
      maxClasses: 6
    });

    expect(result?.calendarStep).toEqual({ unit: 'month', count: 3 });
    expect(result?.breaks.map(isoDay)).toEqual([
      '2020-07-01',
      '2020-10-01',
      '2021-01-01',
      '2021-04-01'
    ]);
    expect(isoDay(result!.roundedMin!)).toBe('2020-04-01');
    expect(isoDay(result!.roundedMax!)).toBe('2021-07-01');
    expect(result?.counts.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('should keep the current step and fall back to an automatic one when it gives too many classes', async () => {
    const forced = await calculateCalendarBreaks({
      datasetId: 'source',
      columnName: 'd2020',
      maxClasses: 3,
      step: { unit: 'month', count: 2 }
    });
    expect(forced?.calendarStep).toEqual({ unit: 'month', count: 2 });
    expect(forced?.counts).toHaveLength(7);

    const tooFine = await calculateCalendarBreaks({
      datasetId: 'source',
      columnName: 'd2020',
      maxClasses: 3,
      step: { unit: 'day', count: 1 }
    });
    expect(tooFine?.calendarStep).toEqual({ unit: 'month', count: 6 });
  });

  it('should pool date columns on one calendar scale', async () => {
    const pooled = await calculateCalendarBreaks({
      datasetId: 'source',
      columnName: 'd2020',
      maxClasses: 6,
      pooledColumnNames: ['d2020', 'd2023']
    });

    expect(pooled?.calendarStep).toEqual({ unit: 'year', count: 1 });
    expect(pooled?.counts.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('should read a TIMESTAMPTZ column as UTC calendar dates', async () => {
    const result = await calculateCalendarBreaks({
      datasetId: 'source',
      columnName: 'ts',
      maxClasses: 2,
      step: { unit: 'month', count: 1 }
    });

    expect(result?.calendarStep).toEqual({ unit: 'month', count: 1 });
    expect(result?.breaks.map(isoDay)).toEqual(['2021-07-01']);
    expect(result?.counts).toEqual([1, 9]);
  });

  it('should count manual date classes and read their bounds at the shared granularity', async () => {
    // 2020-04-24 … 2021-04-09
    const result = await calculateCalendarBreakCounts({
      datasetId: 'source',
      columnName: 'd2020',
      breaks: [Date.UTC(2020, 9, 1), Date.UTC(2021, 0, 1)]
    });

    expect(result?.calendarStep).toEqual({ unit: 'month', count: 1 });
    expect(result?.counts).toEqual([4, 3, 3]);
    expect(isoDay(result!.roundedMin!)).toBe('2020-04-01');
    expect(isoDay(result!.roundedMax!)).toBe('2021-05-01');
  });

  it('should route DATE and TIMESTAMPTZ columns to calendar classes, not numbers', async () => {
    expect(await isTemporalColumn('source', 'd2020')).toBe(true);
    expect(await isTemporalColumn('source', 'ts')).toBe(true);
    expect(await isTemporalColumn('source', 'y1960')).toBe(false);
  });

  it('drops the temporary pooled table', async () => {
    const tables = await query(
      state.db!,
      "SELECT table_name FROM duckdb_tables() WHERE table_name LIKE 'kh_classification_%'"
    );
    expect(tables).toEqual([]);
  });
});
