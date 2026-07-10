import { describe, expect, it } from 'vitest';
import type { BBox } from '@ateliercartographie/proj-suggest';
import {
  suggestProjectionsForBbox,
  suggestProjectionsForFeatureBounds
} from './projection-suggest.service';

// Per-feature bboxes of a US-states-like dataset: a connected chain of
// overlapping contiguous-US boxes (one dominant landmass spanning ~58° of
// longitude) plus the three detached territories. Alaska's box crosses the
// antimeridian, so the box enclosing everything is ~358° wide and collapses
// naive matching to world scale — the exact pathology the per-feature path
// must absorb.
const US_FEATURE_BOXES: BBox[] = [
  [-124.41, 33.0, -114.0, 49.0], // Pacific
  [-115.0, 30.0, -104.0, 49.0], // Mountain
  [-105.0, 28.0, -94.0, 49.0], // Plains
  [-95.0, 25.0, -84.0, 47.0], // Midwest
  [-85.0, 25.0, -75.0, 45.0], // Southeast
  [-76.0, 36.0, -66.95, 47.46], // Northeast
  [-179.17, 51.22, 179.77, 71.35], // Alaska (crosses the antimeridian)
  [-160.25, 18.92, -154.81, 22.23], // Hawaii
  [-67.96, 17.91, -65.22, 18.51] // Puerto Rico
];

const NAIVE_UNION_BBOX: BBox = [-179.17, 17.91, 179.77, 71.35];

function width(bbox: [number, number, number, number]): number {
  return bbox[2] - bbox[0];
}

describe('suggestProjectionsForFeatureBounds', () => {
  it('discards detached territories so the national USA projection still matches', () => {
    const fromFeatures = suggestProjectionsForFeatureBounds(US_FEATURE_BOXES);
    expect(fromFeatures).not.toBeNull();
    expect(fromFeatures!.national.some((s) => s.id === 'national-usa')).toBe(
      true
    );

    // The naive single bbox enclosing every feature spans the antimeridian and
    // never surfaces the USA national projection.
    const fromUnion = suggestProjectionsForBbox(NAIVE_UNION_BBOX);
    expect(fromUnion!.national.some((s) => s.id === 'national-usa')).toBe(
      false
    );
  });

  it('attaches the reduced (mainland) bbox to suggestions, not the inflated one', () => {
    const result = suggestProjectionsForFeatureBounds(US_FEATURE_BOXES);
    const suggestion = result!.national[0] ?? result!.generic[0];
    expect(suggestion).toBeDefined();
    // Continental US spans ~58° of longitude; the inflated union spans ~358°.
    expect(width(suggestion.bbox)).toBeLessThan(120);
    expect(width(NAIVE_UNION_BBOX)).toBeGreaterThan(300);
  });

  it('returns null when no feature bbox is valid', () => {
    expect(
      suggestProjectionsForFeatureBounds([[10, 999, 20, 1000]])
    ).toBeNull();
    expect(suggestProjectionsForFeatureBounds([])).toBeNull();
  });

  it('still works for a single valid feature bbox (no reduction needed)', () => {
    const single: BBox = [-5, 41, 10, 51];
    const result = suggestProjectionsForFeatureBounds([single]);
    expect(result).not.toBeNull();
    expect(result!.generic.length).toBeGreaterThan(0);
  });
});
