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

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: { getAllDatasets: () => [], selectedDataset: null }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {}
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: { register: vi.fn(), notifyChange: vi.fn() }
}));

import {
  resolveProportionalSymbolMaxSize,
  resolveProportionalSymbolMinSize,
  SPARSE_POLYGON_THRESHOLD,
  SPARSE_SYMBOL_FLOOR_PX,
  DENSE_SYMBOL_FLOOR_PX
} from '$lib/features/commons/store/visualization.store.svelte';

describe('resolveProportionalSymbolMaxSize — density-aware floor', () => {
  it('caps at 24 px for very small datasets', () => {
    expect(resolveProportionalSymbolMaxSize(1)).toBe(24);
    expect(resolveProportionalSymbolMaxSize(0)).toBe(24);
  });

  it('returns 14 px for ~96 features (French départements)', () => {
    expect(resolveProportionalSymbolMaxSize(96)).toBe(14);
  });

  it('respects the sparse floor (10 px) for 332 features (NUTS 2)', () => {
    // raw formula: round(140 / sqrt(332)) = 8 → clamped up to floor 10
    expect(resolveProportionalSymbolMaxSize(332)).toBe(SPARSE_SYMBOL_FLOOR_PX);
  });

  it('respects the sparse floor for 499 features (just under threshold)', () => {
    expect(resolveProportionalSymbolMaxSize(499)).toBe(SPARSE_SYMBOL_FLOOR_PX);
  });

  it('switches to the dense floor (6 px) at 500 features', () => {
    // raw formula: round(140 / sqrt(500)) = 6 → already at dense floor
    expect(resolveProportionalSymbolMaxSize(SPARSE_POLYGON_THRESHOLD)).toBe(
      DENSE_SYMBOL_FLOOR_PX
    );
  });

  it('keeps the dense floor for 1000 features', () => {
    // raw formula: round(140 / sqrt(1000)) = 4 → clamped up to dense floor 6
    expect(resolveProportionalSymbolMaxSize(1000)).toBe(DENSE_SYMBOL_FLOOR_PX);
  });

  it('keeps the dense floor for 5000 features (commune scale)', () => {
    expect(resolveProportionalSymbolMaxSize(5000)).toBe(DENSE_SYMBOL_FLOOR_PX);
  });

  it('keeps the dense floor for 35000 features (IRIS scale)', () => {
    expect(resolveProportionalSymbolMaxSize(35000)).toBe(DENSE_SYMBOL_FLOOR_PX);
  });

  it('the formula is monotonically non-increasing in rowCount', () => {
    let last = resolveProportionalSymbolMaxSize(1);
    for (const n of [10, 50, 100, 200, 500, 1000, 5000, 35000]) {
      const next = resolveProportionalSymbolMaxSize(n);
      expect(next).toBeLessThanOrEqual(last);
      last = next;
    }
  });
});

describe('resolveProportionalSymbolMinSize — companion', () => {
  it('returns max/4 within [1, 4] bounds', () => {
    expect(resolveProportionalSymbolMinSize(24)).toBe(4);
    expect(resolveProportionalSymbolMinSize(14)).toBe(4); // 14/4 = 3.5 → 4
    expect(resolveProportionalSymbolMinSize(10)).toBe(3); // 10/4 = 2.5 → 3
    expect(resolveProportionalSymbolMinSize(6)).toBe(2);
    expect(resolveProportionalSymbolMinSize(2)).toBe(1);
  });

  it('never returns less than 1 px', () => {
    expect(resolveProportionalSymbolMinSize(0)).toBe(1);
    expect(resolveProportionalSymbolMinSize(1)).toBe(1);
  });

  it('keeps minSize ≤ maxSize for every density tier', () => {
    for (const n of [1, 50, 96, 332, 500, 1000, 5000, 35000]) {
      const max = resolveProportionalSymbolMaxSize(n);
      const min = resolveProportionalSymbolMinSize(max);
      expect(min).toBeLessThanOrEqual(max);
    }
  });
});
