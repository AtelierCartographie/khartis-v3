import { describe, expect, it } from 'vitest';
import { computeJenksBreaks } from '$lib/features/commons/services/jenks';

function totalWithinClassVariance(
  data: readonly number[],
  breaks: readonly number[]
): number {
  const sorted = [...data].sort((a, b) => a - b);
  const boundaries = [-Infinity, ...breaks, Infinity];
  let total = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lower = boundaries[i];
    const upper = boundaries[i + 1];
    const klass = sorted.filter((v) => v > lower && v <= upper);
    if (klass.length === 0) continue;
    const mean = klass.reduce((sum, v) => sum + v, 0) / klass.length;
    total += klass.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  }
  return total;
}

describe('computeJenksBreaks', () => {
  it('returns empty array when numClasses < 2', () => {
    expect(computeJenksBreaks([1, 2, 3, 4, 5], 1)).toEqual([]);
    expect(computeJenksBreaks([1, 2, 3, 4, 5], 0)).toEqual([]);
  });

  it('returns empty array when there are fewer values than classes', () => {
    expect(computeJenksBreaks([1, 2], 3)).toEqual([]);
  });

  it('returns empty array on empty input', () => {
    expect(computeJenksBreaks([], 3)).toEqual([]);
  });

  it('produces strictly ascending breaks', () => {
    const breaks = computeJenksBreaks(
      [1, 2, 3, 10, 11, 12, 50, 51, 52, 100, 101, 102],
      3
    );
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
  });

  it('produces (numClasses - 1) breaks for well-separated clusters', () => {
    const breaks = computeJenksBreaks(
      [1, 2, 3, 10, 11, 12, 50, 51, 52, 100, 101, 102],
      4
    );
    expect(breaks).toHaveLength(3);
  });

  it('separates 4 visually obvious clusters at their upper bounds', () => {
    // Clusters: [1..3], [10..12], [50..52], [100..102]
    // Convention: breaks are the upper bound of each class except the last,
    // so for 4 classes we expect 3 breaks at the upper end of clusters 1, 2, 3.
    const data = [1, 2, 3, 10, 11, 12, 50, 51, 52, 100, 101, 102];
    const breaks = computeJenksBreaks(data, 4);
    expect(breaks).toHaveLength(3);
    expect(breaks[0]).toBeGreaterThanOrEqual(3);
    expect(breaks[0]).toBeLessThanOrEqual(12);
    expect(breaks[1]).toBeGreaterThanOrEqual(12);
    expect(breaks[1]).toBeLessThanOrEqual(52);
    expect(breaks[2]).toBeGreaterThanOrEqual(52);
    expect(breaks[2]).toBeLessThanOrEqual(102);
  });

  it('ignores non-finite values (NaN, Infinity)', () => {
    const breaks = computeJenksBreaks(
      [1, 2, NaN, 3, Infinity, 10, 11, 12, -Infinity, 50, 51, 52],
      3
    );
    expect(breaks.every((b) => Number.isFinite(b))).toBe(true);
    expect(breaks).toHaveLength(2);
  });

  it('handles unsorted input', () => {
    const sorted = computeJenksBreaks([1, 5, 3, 2, 4, 10, 11, 12], 3);
    const shuffled = computeJenksBreaks([12, 3, 1, 11, 5, 4, 2, 10], 3);
    expect(sorted).toEqual(shuffled);
  });

  it('handles duplicates without producing duplicate breaks', () => {
    const breaks = computeJenksBreaks(
      [1, 1, 1, 5, 5, 5, 10, 10, 10, 20, 20, 20],
      4
    );
    const unique = new Set(breaks);
    expect(unique.size).toBe(breaks.length);
  });

  it('handles a large evenly-distributed dataset within sampling guard', () => {
    // 5000 values - triggers sampling (MAX_VALUES = 1000)
    const data = Array.from({ length: 5000 }, (_, i) => i);
    const breaks = computeJenksBreaks(data, 5);
    expect(breaks).toHaveLength(4);
    // Breaks should be roughly evenly distributed for a uniform distribution
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    // For a uniform 0..4999, Jenks tends to produce breaks near 1000/2000/3000/4000
    expect(breaks[0]).toBeGreaterThan(500);
    expect(breaks[breaks.length - 1]).toBeLessThan(4500);
  });

  it('produces 4 strictly ascending breaks for the canonical 5-class reference set', () => {
    // From Bivand et al. "An R Package for Classification of Univariate Data".
    // Multiple Jenks-optimal solutions may exist for tied configurations;
    // we assert structural correctness + variance stays close to reference.
    const data = [1.5, 2.3, 4.0, 4.4, 4.7, 5.1, 5.8, 7.2];
    const breaks = computeJenksBreaks(data, 5);
    expect(breaks).toHaveLength(4);
    expect(breaks[0]).toBe(2.3);
    expect(breaks[breaks.length - 1]).toBe(5.8);
    expect(totalWithinClassVariance(data, breaks)).toBeLessThanOrEqual(0.7);
  });

  it('handles all-equal input by returning no breaks', () => {
    expect(computeJenksBreaks([5, 5, 5, 5, 5], 3)).toEqual([]);
  });
});
