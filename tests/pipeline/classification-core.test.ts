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

import {
  computeDivergingSplit,
  getEqualIntervalBreaks,
  getStandardDeviationBreaks,
  sanitizeBreaks
} from '$lib/features/commons/services/classification.service';

describe('getEqualIntervalBreaks', () => {
  it('produces N − 1 breaks for N classes on a clean range', () => {
    expect(getEqualIntervalBreaks(0, 100, 5)).toEqual([20, 40, 60, 80]);
  });

  it('handles a non-integer step', () => {
    expect(getEqualIntervalBreaks(0, 10, 4)).toEqual([2.5, 5, 7.5]);
  });

  it('handles negative-to-positive ranges', () => {
    expect(getEqualIntervalBreaks(-10, 10, 4)).toEqual([-5, 0, 5]);
  });

  it('returns no breaks when min === max (sanitised away)', () => {
    expect(getEqualIntervalBreaks(5, 5, 4)).toEqual([]);
  });

  it('returns one break for 2 classes', () => {
    expect(getEqualIntervalBreaks(0, 100, 2)).toEqual([50]);
  });

  it('produces ascending sanitised breaks (no duplicates, none equal to min/max)', () => {
    const breaks = getEqualIntervalBreaks(0, 1, 10);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    expect(breaks.every((b) => b > 0 && b < 1)).toBe(true);
  });
});

describe('getStandardDeviationBreaks', () => {
  it('produces N − 1 breaks at integer multiples of σ around the mean', () => {
    // For N=4, midpoint=1 → breaks at mean − σ, mean, mean + σ
    expect(getStandardDeviationBreaks(50, 10, 4, 0, 100)).toEqual([40, 50, 60]);
  });

  it('produces N − 1 breaks for N=5 (symmetric around mean)', () => {
    // For N=5, midpoint=1.5 → breaks at mean ± 1.5σ, mean ± 0.5σ
    expect(getStandardDeviationBreaks(50, 10, 5, 0, 100)).toEqual([
      35, 45, 55, 65
    ]);
  });

  it('returns no breaks when stddev is non-positive', () => {
    expect(getStandardDeviationBreaks(50, 0, 4, 0, 100)).toEqual([]);
    expect(getStandardDeviationBreaks(50, -5, 4, 0, 100)).toEqual([]);
  });

  it('returns no breaks when stddev is not finite', () => {
    expect(getStandardDeviationBreaks(50, NaN, 4, 0, 100)).toEqual([]);
    expect(
      getStandardDeviationBreaks(50, Number.POSITIVE_INFINITY, 4, 0, 100)
    ).toEqual([]);
  });

  it('drops breaks falling outside [min, max] but keeps interior ones', () => {
    // mean=50, σ=200, N=4 → breaks at -150, 50, 250 → only 50 survives
    expect(getStandardDeviationBreaks(50, 200, 4, 0, 100)).toEqual([50]);
  });

  it('keeps all breaks when they all fall inside [min, max]', () => {
    // mean=50, σ=20, N=4 → breaks at 30, 50, 70 — all inside
    expect(getStandardDeviationBreaks(50, 20, 4, 0, 100)).toEqual([30, 50, 70]);
  });

  it('handles 2 classes (single break at the mean)', () => {
    expect(getStandardDeviationBreaks(50, 10, 2, 0, 100)).toEqual([50]);
  });
});

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
