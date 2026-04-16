import { describe, expect, it } from 'vitest';
import { computeCentroid } from '$lib/features/data-pipeline/types';

describe('computeCentroid', () => {
  it('returns the geometric center of a square bounding box', () => {
    const centroid = computeCentroid([0, 0, 10, 10]);
    expect(centroid[0]).toBe(5);
    expect(centroid[1]).toBe(5);
  });

  it('handles negative coordinates correctly', () => {
    const centroid = computeCentroid([-180, -90, 180, 90]);
    expect(centroid[0]).toBe(0);
    expect(centroid[1]).toBe(0);
  });

  it('handles non-square bounding boxes', () => {
    const centroid = computeCentroid([2, 48, 6, 52]);
    expect(centroid[0]).toBe(4);
    expect(centroid[1]).toBe(50);
  });

  it('handles single-point bounds (collapsed box)', () => {
    const centroid = computeCentroid([5, 45, 5, 45]);
    expect(centroid[0]).toBe(5);
    expect(centroid[1]).toBe(45);
  });
});
