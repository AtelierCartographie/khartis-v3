import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GeoProjection } from 'd3-geo';
import type { ProjectionPresets } from '$lib/features/map/types/basemap.types';
import type { BBox } from '$lib/features/map/types';
import type { D3Usage } from 'proj-suggest';
import { PROJECTIONS } from '$lib/features/commons/utils/projection.utils';
import { computeProjectedBboxForProjection } from '$lib/features/map/utils/geoarrow-stream-bridge.utils';
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

const europeLaeaD3Config: D3Usage = {
  projection: 'geoAzimuthalEqualArea',
  rotate: [-10, -52]
};

const catalogBboxes = (
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'static/basemaps/all-basemaps-metadata.json'),
      'utf8'
    )
  ) as Array<{ file: string; bbox: BBox }>
).map(({ file, bbox }) => ({ file, bbox }));

function isProjectedPoint(value: unknown): value is [number, number] {
  return Array.isArray(value);
}

function asGeoProjection(projection: unknown): GeoProjection {
  return projection as GeoProjection;
}

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

  it('resolves custom proj4 overrides to finite projected points', () => {
    const projection = resolveUserProjectionOverride({
      state: {
        selected: 'mercator',
        overrideActive: true,
        customCode:
          '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs +type=crs',
        center: undefined,
        longitude: 0,
        latitude: 0,
        rotation: 0
      },
      fitBbox: [-63.09, -21.39, 55.84, 71.12],
      viewportSize: { width: 789, height: 539 },
      padding: 40,
      projectionPresets
    });
    let projected: unknown = null;
    const stream = projection?.stream({
      point(x: number, y: number) {
        projected = [x, y];
      },
      lineStart() {},
      lineEnd() {},
      polygonStart() {},
      polygonEnd() {}
    });

    stream?.point(16.258, 47.245);

    expect(isProjectedPoint(projected)).toBe(true);
    if (!isProjectedPoint(projected)) {
      throw new Error('Projection did not emit a point');
    }
    expect(projected.every(Number.isFinite)).toBe(true);
  });

  it('resolves registered EPSG custom overrides to finite projected points', () => {
    const projection = resolveUserProjectionOverride({
      state: {
        selected: 'lambert-conformal',
        overrideActive: true,
        customCode: 'EPSG:2154',
        center: undefined,
        longitude: 0,
        latitude: 0,
        rotation: 0
      },
      fitBbox: [-5.15, 41.33, 9.56, 51.09],
      viewportSize: { width: 789, height: 539 },
      padding: 40,
      projectionPresets
    });

    const projected = projection?.([2.3522, 48.8566]);

    expect(isProjectedPoint(projected)).toBe(true);
    if (!isProjectedPoint(projected)) {
      throw new Error('Projection did not emit a point');
    }
    expect(projected.every(Number.isFinite)).toBe(true);
  });

  it('preserves the native Atlantis rotation when controls are neutral', () => {
    const atlantis = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'atlantis',
          overrideActive: true,
          customCode: undefined,
          center: undefined,
          longitude: 0,
          latitude: 0,
          rotation: 0
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );
    const mollweide = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'mollweide',
          overrideActive: true,
          customCode: undefined,
          center: undefined,
          longitude: 0,
          latitude: 0,
          rotation: 0
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );

    expect(atlantis.rotate()[0]).toBeCloseTo(30);
    expect(atlantis.rotate()[1]).toBeCloseTo(-45);
    expect(atlantis([0, 0])).not.toEqual(mollweide([0, 0]));
  });

  it('applies user rotation relative to the projection native rotation', () => {
    const projection = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'atlantis',
          overrideActive: true,
          customCode: undefined,
          center: undefined,
          longitude: 0,
          latitude: 0,
          rotation: 15
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );

    expect(projection.rotate()[0]).toBeCloseTo(45);
    expect(projection.rotate()[1]).toBeCloseTo(-45);
  });

  it('applies non-neutral user center values to finite projected coordinates', () => {
    const baseProjection = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'natural-earth',
          overrideActive: true,
          customCode: undefined,
          center: undefined,
          longitude: 0,
          latitude: 0,
          rotation: 0
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );
    const centeredProjection = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'natural-earth',
          overrideActive: true,
          customCode: undefined,
          center: [12, 8],
          longitude: 12,
          latitude: 8,
          rotation: 0
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );

    const basePoint = baseProjection([10, 45]);
    const centeredPoint = centeredProjection([10, 45]);

    expect(centeredPoint?.every(Number.isFinite)).toBe(true);
    expect(centeredPoint).not.toEqual(basePoint);
  });

  it('preserves d3 suggestion rotation when proj4 fallback is used', () => {
    const projection = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'mercator',
          overrideActive: true,
          customCode: undefined,
          suggestionD3Config: europeLaeaD3Config,
          center: undefined,
          longitude: 0,
          latitude: 0,
          rotation: 0
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );

    expect(projection.rotate()[0]).toBeCloseTo(-10);
    expect(projection.rotate()[1]).toBeCloseTo(-52);
  });

  it('applies user rotation relative to a d3 suggestion rotation', () => {
    const projection = asGeoProjection(
      resolveUserProjectionOverride({
        state: {
          selected: 'mercator',
          overrideActive: true,
          customCode: undefined,
          suggestionD3Config: europeLaeaD3Config,
          center: undefined,
          longitude: 0,
          latitude: 0,
          rotation: 15
        },
        fitBbox: [-24.6, 34.8, 45.8, 71.2],
        viewportSize: { width: 960, height: 600 },
        padding: 40,
        projectionPresets
      })
    );

    expect(projection.rotate()[0]).toBeCloseTo(5);
    expect(projection.rotate()[1]).toBeCloseTo(-52);
  });

  it('ignores custom proj4 overrides that produce invalid coordinates', () => {
    const projection = resolveUserProjectionOverride({
      state: {
        selected: 'mercator',
        overrideActive: true,
        customCode:
          '+proj=laea +lon_0=-3.63 +lat_0=24.86 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
        center: undefined,
        longitude: 0,
        latitude: 0,
        rotation: 0
      },
      fitBbox: [-63.09, -21.39, 55.84, 71.12],
      viewportSize: { width: 789, height: 539 },
      padding: 40,
      projectionPresets
    });

    expect(projection).toBeUndefined();
  });

  it('fits every built-in projection to every catalog basemap bbox with finite coordinates', () => {
    expect(catalogBboxes.length).toBeGreaterThan(0);

    for (const projectionInfo of PROJECTIONS) {
      for (const { file, bbox } of catalogBboxes) {
        const projection = resolveUserProjectionOverride({
          state: {
            selected: projectionInfo.id,
            overrideActive: true,
            customCode: undefined,
            center: undefined,
            longitude: 0,
            latitude: 0,
            rotation: 0
          },
          fitBbox: bbox,
          viewportSize: { width: 960, height: 600 },
          padding: 40,
          projectionPresets
        });

        expect(
          projection,
          `${projectionInfo.id} should resolve for ${file}`
        ).toBeDefined();

        const projectedBbox = computeProjectedBboxForProjection(
          projection!,
          bbox
        );
        expect(
          projectedBbox,
          `${projectionInfo.id} should project ${file} bbox`
        ).not.toBeNull();
        expect(
          projectedBbox?.every(Number.isFinite),
          `${projectionInfo.id} should produce finite bbox values for ${file}`
        ).toBe(true);
        const width = projectedBbox![2] - projectedBbox![0];
        const height = projectedBbox![3] - projectedBbox![1];
        expect(
          width,
          `${projectionInfo.id} should produce positive projected width for ${file}: ${projectedBbox?.join(',')}`
        ).toBeGreaterThan(0);
        expect(
          height,
          `${projectionInfo.id} should produce positive projected height for ${file}: ${projectedBbox?.join(',')}`
        ).toBeGreaterThan(0);
      }
    }
  });
});
