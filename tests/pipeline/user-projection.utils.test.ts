import { describe, expect, it } from 'vitest';
import type { ProjectionPresets } from '$lib/features/map/types/basemap.types';
import { computeProjectedBboxForProjection } from '$lib/features/map/utils/geoarrow-stream-bridge';
import {
  getCompositeProjectionPresetId,
  getCompositeProjectionSelectionId,
  isCompositeProjectionSelectionId,
  resolveUserProjectionOverride,
  usesMercatorMapProjection
} from '$lib/features/map/utils/user-projection.utils';

const projectionPresets: ProjectionPresets = {
  FRANCE_DOM_TOM: {
    entries: [
      {
        id: 'mainland',
        proj4:
          '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs +type=crs',
        bounds: [
          [-5.15, 41.33],
          [9.56, 51.09]
        ],
        layout: { x: 0, y: 0, width: 1, height: 1 }
      }
    ]
  }
};

describe('user projection utils', () => {
  it('encodes composite selection ids and keeps them on the mercator engine', () => {
    const selectionId = getCompositeProjectionSelectionId('FRANCE_DOM_TOM');

    expect(selectionId).toBe('composite:FRANCE_DOM_TOM');
    expect(getCompositeProjectionPresetId(selectionId)).toBe('FRANCE_DOM_TOM');
    expect(isCompositeProjectionSelectionId(selectionId)).toBe(true);
    expect(usesMercatorMapProjection(selectionId)).toBe(true);
  });

  it('resolves composite overrides without requiring a fit bbox', () => {
    const projection = resolveUserProjectionOverride({
      state: {
        selected: getCompositeProjectionSelectionId('FRANCE_DOM_TOM'),
        overrideActive: true,
        customCode: undefined,
        center: undefined,
        longitude: 0,
        latitude: 0,
        rotation: 0
      },
      fitBbox: null,
      viewportSize: { width: 960, height: 600 },
      padding: 40,
      projectionPresets
    });

    expect(projection).toBeDefined();
    expect(
      computeProjectedBboxForProjection(
        projection!,
        [-5.15, 41.33, 9.56, 51.09]
      )
    ).not.toBeNull();
  });
});
