import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: vi.fn() },
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  }
}));
vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: vi.fn(),
    datasetsVersion: 0
  }
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

import { mapMethodToMacro } from '$lib/features/commons/services/classification.service';

const CDC_METHODS = [
  'kmeans',
  'equal_interval',
  'quantiles',
  'manual',
  'q6',
  'nested_means',
  'head_tail'
] as const;

describe('mapMethodToMacro — CDC [VIZ-02d] guarantees', () => {
  it('maps kmeans → kmeans (POC macro)', () => {
    expect(mapMethodToMacro('kmeans' as never)).toBe('kmeans');
  });

  it('maps quantiles → quantile (POC macro)', () => {
    expect(mapMethodToMacro('quantiles' as never)).toBe('quantile');
  });

  it('maps equal_interval → equi_width (POC macro)', () => {
    expect(mapMethodToMacro('equal_interval' as never)).toBe('equi_width');
  });

  it('maps q6 → q6 (POC macro)', () => {
    expect(mapMethodToMacro('q6' as never)).toBe('q6');
  });

  it('maps nested_means → nested_means (POC macro)', () => {
    expect(mapMethodToMacro('nested_means' as never)).toBe('nested_means');
  });

  it('maps head_tail → headtail2 (POC macro)', () => {
    expect(mapMethodToMacro('head_tail' as never)).toBe('headtail2');
  });

  it('maps legacy jenks to kmeans', () => {
    expect(mapMethodToMacro('jenks' as never)).toBe('kmeans');
  });

  it('returns null for manual (user-provided breaks)', () => {
    expect(mapMethodToMacro('manual' as never)).toBeNull();
  });

  it('covers every CDC method exactly once', () => {
    expect(CDC_METHODS).toHaveLength(7);
    for (const method of CDC_METHODS) {
      expect(() => mapMethodToMacro(method as never)).not.toThrow();
    }
  });
});
