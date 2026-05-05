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

import {
  computeDivergingSplit,
  sanitizeBreaks
} from '$lib/features/commons/services/classification.service';

describe('sanitizeBreaks', () => {
  it('drops values <= min and >= max', () => {
    expect(sanitizeBreaks([0, 5, 10, 15, 20], 5, 15)).toEqual([10]);
  });

  it('drops non-finite values', () => {
    expect(sanitizeBreaks([5, NaN, 10, Infinity, 15], 0, 20)).toEqual([
      5, 10, 15
    ]);
  });

  it('sorts ascending', () => {
    expect(sanitizeBreaks([30, 10, 20], 0, 40)).toEqual([10, 20, 30]);
  });

  it('drops consecutive duplicates after sort', () => {
    expect(sanitizeBreaks([10, 20, 20, 30, 30, 30], 0, 40)).toEqual([
      10, 20, 30
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(sanitizeBreaks([], 0, 100)).toEqual([]);
  });

  it('returns an empty array when min === max', () => {
    expect(sanitizeBreaks([1, 2, 3], 5, 5)).toEqual([]);
  });
});

describe('computeDivergingSplit', () => {
  it('falls back to symmetric split when breakpoint is null', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], null)).toEqual({
      lowerCount: 2,
      upperCount: 2,
      hasCenterClass: true
    });
  });

  it('falls back to symmetric split on even class counts when breakpoint is null', () => {
    expect(computeDivergingSplit(4, [25, 50, 75], null)).toEqual({
      lowerCount: 2,
      upperCount: 2,
      hasCenterClass: false
    });
  });

  it('falls back to symmetric split when breaks length does not match classes − 1', () => {
    expect(computeDivergingSplit(5, [20, 40], 30)).toEqual({
      lowerCount: 2,
      upperCount: 2,
      hasCenterClass: true
    });
  });

  it('marks the straddled class as centre when breakpoint sits inside a class', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 50)).toEqual({
      lowerCount: 2,
      upperCount: 2,
      hasCenterClass: true
    });
  });

  it('splits asymmetrically when breakpoint sits inside the first class', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 10)).toEqual({
      lowerCount: 0,
      upperCount: 4,
      hasCenterClass: true
    });
  });

  it('splits asymmetrically when breakpoint sits inside the last class', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 90)).toEqual({
      lowerCount: 4,
      upperCount: 0,
      hasCenterClass: true
    });
  });

  it('splits cleanly on an exact break boundary with no centre class', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 40)).toEqual({
      lowerCount: 2,
      upperCount: 3,
      hasCenterClass: false
    });
  });

  it('counts a breakpoint equal to the last break as lower-side', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 80)).toEqual({
      lowerCount: 4,
      upperCount: 1,
      hasCenterClass: false
    });
  });

  it('treats a breakpoint below all breaks as fully upper', () => {
    expect(computeDivergingSplit(4, [25, 50, 75], -100)).toEqual({
      lowerCount: 0,
      upperCount: 3,
      hasCenterClass: true
    });
  });

  it('treats a breakpoint above all breaks as fully lower', () => {
    expect(computeDivergingSplit(4, [25, 50, 75], 500)).toEqual({
      lowerCount: 3,
      upperCount: 0,
      hasCenterClass: true
    });
  });
});
