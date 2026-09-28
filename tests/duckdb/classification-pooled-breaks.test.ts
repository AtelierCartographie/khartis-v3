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
  detectDivergingBreakpoint
} from '$lib/features/commons/services/classification.service';
import type { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';

const EQUAL_INTERVAL = 'equal_interval' as ClassificationMethod;

beforeAll(async () => {
  state.db = await createTestInstance();
  await state.db.connection.run(breaksMacros);
  await run(
    state.db,
    'CREATE TABLE collection AS SELECT i::DOUBLE AS y1960, (i + 90)::INTEGER AS y2020, i::DOUBLE AS gain, (-i)::DOUBLE AS loss FROM range(1, 11) t(i)'
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

  it('drops the temporary pooled table', async () => {
    const tables = await query(
      state.db!,
      "SELECT table_name FROM duckdb_tables() WHERE table_name LIKE 'kh_classification_%'"
    );
    expect(tables).toEqual([]);
  });
});
