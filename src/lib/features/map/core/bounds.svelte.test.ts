import { Table, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import {
  calculateBoundsFromGeoArrow,
  calculateBoundsFromGeoArrowRows
} from './bounds';

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

  it('can calculate bounds for a subset of GeoArrow rows', () => {
    const table = new Table({
      geom: vectorFromArray([
        JSON.stringify({
          type: 'Point',
          coordinates: [2.35, 48.85]
        }),
        JSON.stringify({
          type: 'Point',
          coordinates: [13.4, 52.52]
        }),
        JSON.stringify({
          type: 'Point',
          coordinates: [-74, 40.71]
        })
      ]),
      id: vectorFromArray(['FRA', 'DEU', 'USA'])
    });

    const bounds = calculateBoundsFromGeoArrowRows(
      table,
      (rowIndex) => rowIndex < 2
    ) as [[number, number], [number, number]] | null;

    expect(bounds).toEqual([
      [2.35, 48.85],
      [13.4, 52.52]
    ]);
  });
});
