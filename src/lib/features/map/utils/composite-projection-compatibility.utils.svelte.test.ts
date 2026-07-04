import { describe, expect, it } from 'vitest';
import type { ProjectionPresets } from '../types/basemap.types';
import {
  bboxesIntersect,
  isCompositeProjectionPresetCompatibleWithBbox
} from './composite-projection-compatibility.utils';

const projectionPresets: ProjectionPresets = {
  TEST: {
    entries: [
      {
        id: 'mainland',
        proj4: '+proj=longlat +datum=WGS84 +no_defs',
        bounds: [
          [-5, 40],
          [10, 52]
        ],
        layout: { x: 0, y: 0, width: 1, height: 1 }
      }
    ]
  },
  EMPTY: {
    entries: []
  }
};

describe('composite projection compatibility', () => {
  it('detects bbox intersections, including touching edges', () => {
    expect(bboxesIntersect([0, 0, 10, 10], [10, 10, 20, 20])).toBe(true);
    expect(bboxesIntersect([0, 0, 10, 10], [11, 11, 20, 20])).toBe(false);
  });

  it('allows unknown bbox or presets and rejects missing preset entries', () => {
    expect(
      isCompositeProjectionPresetCompatibleWithBbox('TEST', null, null)
    ).toBe(true);
    expect(
      isCompositeProjectionPresetCompatibleWithBbox('MISSING', [0, 0, 1, 1], {
        TEST: projectionPresets.TEST
      })
    ).toBe(false);
    expect(
      isCompositeProjectionPresetCompatibleWithBbox(
        'EMPTY',
        [0, 0, 1, 1],
        projectionPresets
      )
    ).toBe(false);
  });

  it('matches a composite preset when any entry intersects the bbox', () => {
    expect(
      isCompositeProjectionPresetCompatibleWithBbox(
        'TEST',
        [2, 42, 4, 44],
        projectionPresets
      )
    ).toBe(true);
    expect(
      isCompositeProjectionPresetCompatibleWithBbox(
        'TEST',
        [20, 60, 30, 70],
        projectionPresets
      )
    ).toBe(false);
  });
});
