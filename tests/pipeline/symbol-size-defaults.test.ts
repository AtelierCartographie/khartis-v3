import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {},
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  DUCK_CONST: {},
  GEO_CONSTANTS: { WGS84_CRS: 'EPSG:4326' }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: { getAllDatasets: () => [], selectedDataset: null }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {}
}));

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: { register: vi.fn(), notifyChange: vi.fn() }
}));

import {
  resolveVisualizationPreset,
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
import type { DatasetResult } from '$lib/features/data-pipeline/types/dataset.types';

function createPolygonDataset(rowCount: number): DatasetResult {
  return {
    id: 'dataset',
    name: 'Dataset',
    sourceFileId: 'source-file',
    tableName: 'dataset_table',
    columns: [],
    rowCount,
    geometry: {
      type: 'Polygon',
      bounds: [0, 0, 1, 1],
      centroid: [0.5, 0.5]
    },
    metadata: {
      processedAt: new Date('2026-01-01T00:00:00.000Z'),
      fileType: 'geojson',
      parserUsed: 'test'
    }
  };
}

function resolveProportionalSymbolSizes(rowCount: number) {
  const preset = resolveVisualizationPreset(
    VisualizationType.PROPORTIONAL,
    createPolygonDataset(rowCount)
  );
  if (!preset.symbols) {
    throw new Error('Expected proportional preset symbols');
  }
  return {
    maxSize: preset.symbols.maxSize,
    minSize: preset.symbols.minSize
  };
}

describe('proportional symbol defaults — density-aware floor', () => {
  it('caps at 24 px for very small datasets', () => {
    expect(resolveProportionalSymbolSizes(1).maxSize).toBe(24);
    expect(resolveProportionalSymbolSizes(0).maxSize).toBe(24);
  });

  it('returns 14 px for ~96 features (French départements)', () => {
    expect(resolveProportionalSymbolSizes(96).maxSize).toBe(14);
  });

  it('respects the sparse floor (10 px) for 332 features (NUTS 2)', () => {
    // raw formula: round(140 / sqrt(332)) = 8 → clamped up to floor 10
    expect(resolveProportionalSymbolSizes(332).maxSize).toBe(10);
  });

  it('respects the sparse floor for 499 features (just under threshold)', () => {
    expect(resolveProportionalSymbolSizes(499).maxSize).toBe(10);
  });

  it('switches to the dense floor (6 px) at 500 features', () => {
    // raw formula: round(140 / sqrt(500)) = 6 → already at dense floor
    expect(resolveProportionalSymbolSizes(500).maxSize).toBe(6);
  });

  it('keeps the dense floor for 1000 features', () => {
    // raw formula: round(140 / sqrt(1000)) = 4 → clamped up to dense floor 6
    expect(resolveProportionalSymbolSizes(1000).maxSize).toBe(6);
  });

  it('keeps the dense floor for 5000 features (commune scale)', () => {
    expect(resolveProportionalSymbolSizes(5000).maxSize).toBe(6);
  });

  it('keeps the dense floor for 35000 features (IRIS scale)', () => {
    expect(resolveProportionalSymbolSizes(35000).maxSize).toBe(6);
  });

  it('the formula is monotonically non-increasing in rowCount', () => {
    let last = resolveProportionalSymbolSizes(1).maxSize;
    for (const n of [10, 50, 100, 200, 500, 1000, 5000, 35000]) {
      const next = resolveProportionalSymbolSizes(n).maxSize;
      expect(next).toBeLessThanOrEqual(last);
      last = next;
    }
  });
});

describe('proportional symbol defaults — min size companion', () => {
  it('returns max/4 within [1, 4] bounds for density tiers', () => {
    expect(resolveProportionalSymbolSizes(1)).toMatchObject({
      maxSize: 24,
      minSize: 4
    });
    expect(resolveProportionalSymbolSizes(96)).toMatchObject({
      maxSize: 14,
      minSize: 4
    });
    expect(resolveProportionalSymbolSizes(332)).toMatchObject({
      maxSize: 10,
      minSize: 3
    });
    expect(resolveProportionalSymbolSizes(500)).toMatchObject({
      maxSize: 6,
      minSize: 2
    });
  });

  it('never returns less than 1 px', () => {
    expect(
      resolveProportionalSymbolSizes(35000).minSize
    ).toBeGreaterThanOrEqual(1);
  });

  it('keeps minSize ≤ maxSize for every density tier', () => {
    for (const n of [1, 50, 96, 332, 500, 1000, 5000, 35000]) {
      const sizes = resolveProportionalSymbolSizes(n);
      expect(sizes.minSize).toBeLessThanOrEqual(sizes.maxSize);
    }
  });
});
