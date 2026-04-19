import { Table, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import { calculateBoundsFromGeoArrow } from './bounds';

describe('calculateBoundsFromGeoArrow', () => {
  it('pads single-point bounds instead of falling back to unrelated columns', () => {
    const table = new Table({
      geom: vectorFromArray([
        JSON.stringify({
          type: 'Point',
          coordinates: [5.37, 43.3]
        })
      ]),
      city_name: vectorFromArray(['Marseille']),
      category: vectorFromArray(['PUBLIC'])
    });

    const bounds = calculateBoundsFromGeoArrow(table) as
      | [[number, number], [number, number]]
      | null;

    expect(bounds).not.toBeNull();
    expect(bounds?.[0][0]).toBeCloseTo(5.36, 6);
    expect(bounds?.[0][1]).toBeCloseTo(43.29, 6);
    expect(bounds?.[1][0]).toBeCloseTo(5.38, 6);
    expect(bounds?.[1][1]).toBeCloseTo(43.31, 6);
  });
});
