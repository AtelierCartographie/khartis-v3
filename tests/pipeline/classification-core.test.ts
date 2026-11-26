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
  isDivergingBreakpoint,
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
  it('splits on the breakpoint used as a break', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 40)).toEqual({
      lowerCount: 2,
      upperCount: 3
    });
  });

  it('counts a breakpoint equal to the last break as lower-side', () => {
    expect(computeDivergingSplit(5, [20, 40, 60, 80], 80)).toEqual({
      lowerCount: 4,
      upperCount: 1
    });
  });

  it('never creates a center class: every class sits on one side', () => {
    for (const breakpoint of [-100, 10, 30, 50, 90, 500]) {
      const split = computeDivergingSplit(5, [20, 40, 60, 80], breakpoint);
      expect(split.lowerCount + split.upperCount).toBe(5);
    }
  });

  it('puts every class above a breakpoint below the data', () => {
    expect(computeDivergingSplit(4, [25, 50, 75], -100)).toEqual({
      lowerCount: 0,
      upperCount: 4
    });
  });

  it('splits evenly while the breaks lag behind the class count', () => {
    expect(computeDivergingSplit(5, [20, 40], 30)).toEqual({
      lowerCount: 2,
      upperCount: 3
    });
  });
});

describe('isDivergingBreakpoint', () => {
  it('accepts only a finite number', () => {
    expect(isDivergingBreakpoint(0)).toBe(true);
    expect(isDivergingBreakpoint(-2.5)).toBe(true);
    expect(isDivergingBreakpoint(null)).toBe(false);
    expect(isDivergingBreakpoint(undefined)).toBe(false);
    expect(isDivergingBreakpoint(Number.NaN)).toBe(false);
    expect(isDivergingBreakpoint(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
