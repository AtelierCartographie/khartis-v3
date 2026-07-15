import { describe, expect, it } from 'vitest';
import { Binary, makeTable, vectorFromArray } from 'apache-arrow';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { geoEquirectangular, geoIdentity } from 'd3-geo';
import type {
  BinaryPathData,
  BinaryPointData,
  ProjectionLike
} from '@ateliercartographie/geoarrow-deck-stream';
import type {
  BasemapMetadata,
  ProjectionPresets
} from '../types/basemap.types';
import {
  buildCompositeProjectionFromPresetId,
  computeProjectedBboxForBasemap,
  computeProjectedBboxForProjection,
  pathColorAttr,
  pathWidthAttr,
  pointColorAttr,
  parsePointDataWithProjection,
  projectGeoJSON
} from './geoarrow-stream-bridge.utils';

function createPathData(): BinaryPathData {
  return {
    length: 2,
    positions: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]),
    startIndices: new Uint32Array([0, 2, 5]),
    featureIds: new Uint32Array([10, 20]),
    size: 2
  };
}

function createPointData(): BinaryPointData {
  return {
    length: 3,
    positions: new Float32Array([0, 0, 1, 1, 2, 2]),
    featureIds: new Uint32Array([10, 20, 10]),
    size: 2
  };
}

function wkbPoint(x: number, y: number): Uint8Array {
  const bytes = new Uint8Array(21);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 1);
  view.setUint32(1, 1, true);
  view.setFloat64(5, x, true);
  view.setFloat64(13, y, true);
  return bytes;
}

function binaryVector(values: Uint8Array[]): Uint8Array {
  return vectorFromArray(values, new Binary()) as unknown as Uint8Array;
}

function collectStreamedPoints(
  projection: ProjectionLike,
  ring: [number, number][]
): [number, number][] {
  const points: [number, number][] = [];
  const stream = projection.stream({
    point(x: number, y: number): void {
      points.push([x, y]);
    },
    lineStart(): void {},
    lineEnd(): void {},
    polygonStart(): void {},
    polygonEnd(): void {}
  });

  stream.lineStart();
  for (const point of ring) {
    stream.point(point[0], point[1]);
  }
  stream.lineEnd();

  return points;
}

describe('geoarrow stream bridge path attributes', () => {
  it('marks point colors as normalized Uint8 attributes for Deck.gl', () => {
    const attribute = pointColorAttr(createPointData(), (featureId) =>
      featureId === 10 ? [1, 2, 3, 4] : [5, 6, 7, 8]
    );

    expect(Array.from(attribute.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4
    ]);
    expect(attribute.size).toBe(4);
    expect(attribute.normalized).toBe(true);
  });

  it('replicates line colors for every vertex in each path', () => {
    const attribute = pathColorAttr(createPathData(), (featureId) =>
      featureId === 10 ? [1, 2, 3, 4] : [5, 6, 7, 8]
    );

    expect(Array.from(attribute.value)).toEqual([
      1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8
    ]);
    expect(attribute.size).toBe(4);
  });

  it('replicates line widths for every vertex in each path', () => {
    const attribute = pathWidthAttr(createPathData(), (featureId) =>
      featureId === 10 ? 2 : 6
    );

    expect(Array.from(attribute.value)).toEqual([2, 2, 6, 6, 6]);
    expect(attribute.size).toBe(1);
  });

  it('decodes projected WKB point tables without dropping rows', () => {
    const table = makeTable({
      geometry: binaryVector([wkbPoint(2, 3), wkbPoint(-4, 5)])
    }) as ArrowTable;
    const projection = geoIdentity().scale(2).translate([10, 0]);

    const data = parsePointDataWithProjection(table, projection);

    expect(data.length).toBe(2);
    expect(Array.from(data.positions.slice(0, data.length * 2))).toEqual([
      14, 6, 2, 10
    ]);
    expect(Array.from(data.featureIds.slice(0, data.length))).toEqual([0, 1]);
  });

  it('bounds projected point cache entries per table with LRU eviction', () => {
    const table = makeTable({
      geometry: binaryVector([wkbPoint(2, 3), wkbPoint(-4, 5)])
    }) as ArrowTable;
    const projectionA = geoIdentity().scale(2).translate([10, 0]);
    const projectionB = geoIdentity().scale(3).translate([0, 10]);
    const projectionC = geoIdentity().scale(4).translate([5, 5]);

    const firstA = parsePointDataWithProjection(table, projectionA);
    const firstB = parsePointDataWithProjection(table, projectionB);
    const secondA = parsePointDataWithProjection(table, projectionA);
    const firstC = parsePointDataWithProjection(table, projectionC);
    const secondB = parsePointDataWithProjection(table, projectionB);

    expect(secondA).toBe(firstA);
    expect(firstC).toBe(parsePointDataWithProjection(table, projectionC));
    expect(secondB).not.toBe(firstB);
  });

  it('clips composite projection streams to the cell frames and renders insets in their cell', () => {
    const presets: ProjectionPresets = {
      TEST_EUROPE_DOM_TOM: {
        entries: [
          {
            id: 'mainland',
            proj4:
              '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
            bounds: [
              [-11.0, 34.5],
              [42.0, 71.6]
            ],
            layout: { x: 0, y: 0, width: 1, height: 1 }
          },
          {
            id: 'madeira',
            proj4:
              '+proj=utm +zone=28 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
            bounds: [
              [-17.28, 32.62],
              [-16.27, 33.14]
            ],
            layout: { x: 0.6, y: 0.8, width: 0.1, height: 0.1 },
            scaleMultiplier: 1.3
          }
        ]
      }
    };

    const projection = buildCompositeProjectionFromPresetId(
      'TEST_EUROPE_DOM_TOM',
      1000,
      500,
      presets
    );

    if (!projection) {
      throw new Error('Expected test composite projection');
    }

    const ring: [number, number][] = [
      [-16.905127652705204, 32.838495269525914],
      [-16.818310560055068, 32.76911289942041],
      [-16.744575495064538, 32.74876073752281],
      [-16.82901403723111, 32.63959914189016],
      [-16.94199518520047, 32.6312732574775],
      [-17.21552849081049, 32.73673446003785],
      [-17.270235151932496, 32.816292911092155],
      [-17.197689362183752, 32.87272390544462],
      [-17.051408507444478, 32.80981722321564],
      [-16.905127652705204, 32.838495269525914]
    ];

    const points = collectStreamedPoints(projection, ring);

    const subProjections = (
      projection as unknown as {
        getSubProjections: () => {
          id: string;
          screenExtent: [[number, number], [number, number]];
        }[];
      }
    ).getSubProjections();
    const madeiraExtent = subProjections.find(
      (entry) => entry.id === 'madeira'
    )?.screenExtent;
    if (!madeiraExtent) throw new Error('Expected madeira sub-projection');

    const withinExtent = (
      [x, y]: [number, number],
      [[x0, y0], [x1, y1]]: [[number, number], [number, number]]
    ) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

    expect(points.length).toBeGreaterThan(0);
    // Every streamed point stays inside one of the cell frames: the visible
    // cut is the rectangular screen clipExtent, never a geographic edge.
    expect(
      points.every((point) =>
        subProjections.some((entry) => withinExtent(point, entry.screenExtent))
      )
    ).toBe(true);
    // The Madeira ring lands in the Madeira inset cell.
    expect(points.some((point) => withinExtent(point, madeiraExtent))).toBe(
      true
    );
  });

  it('does not crash when a ring falls entirely outside a composite inset', () => {
    const presets: ProjectionPresets = {
      TEST_EUROPE_DOM_TOM: {
        entries: [
          {
            id: 'mainland',
            proj4:
              '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
            bounds: [
              [-11.0, 34.5],
              [42.0, 71.6]
            ],
            layout: { x: 0, y: 0, width: 1, height: 1 }
          },
          {
            id: 'madeira',
            proj4:
              '+proj=utm +zone=28 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
            bounds: [
              [-17.28, 32.62],
              [-16.27, 33.14]
            ],
            layout: { x: 0.6, y: 0.8, width: 0.1, height: 0.1 },
            scaleMultiplier: 1.3
          }
        ]
      }
    };

    const projection = buildCompositeProjectionFromPresetId(
      'TEST_EUROPE_DOM_TOM',
      1000,
      500,
      presets
    );

    if (!projection) {
      throw new Error('Expected test composite projection');
    }

    const ring: [number, number][] = [
      [-16.905127652705204, 32.838495269525914],
      [-16.818310560055068, 32.76911289942041],
      [-16.744575495064538, 32.74876073752281],
      [-16.82901403723111, 32.63959914189016],
      [-16.94199518520047, 32.6312732574775],
      [-17.21552849081049, 32.73673446003785],
      [-17.270235151932496, 32.816292911092155],
      [-17.197689362183752, 32.87272390544462],
      [-17.051408507444478, 32.80981722321564],
      [-16.905127652705204, 32.838495269525914]
    ];

    function createD3GeoLikeSink() {
      let ringPoints: [number, number][] = [];
      return {
        point(x: number, y: number): void {
          ringPoints.push([x, y]);
        },
        lineStart(): void {
          ringPoints = [];
        },
        lineEnd(): void {
          if (ringPoints.length === 0) {
            throw new Error('Empty ring — d3-geo would crash here');
          }
          ringPoints = [];
        },
        polygonStart(): void {},
        polygonEnd(): void {}
      };
    }

    const stream = projection.stream(createD3GeoLikeSink());

    expect(() => {
      stream.polygonStart();
      stream.lineStart();
      for (const [lon, lat] of ring) {
        stream.point(lon, lat);
      }
      stream.lineEnd();
      stream.polygonEnd();
    }).not.toThrow();
  });

  it('computes composite basemap reference bounds from every inset', () => {
    const presets: ProjectionPresets = {
      TEST_EUROPE_DOM_TOM: {
        entries: [
          {
            id: 'mainland',
            proj4:
              '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
            bounds: [
              [-11.0, 34.5],
              [42.0, 71.6]
            ],
            layout: { x: 0, y: 0, width: 1, height: 0.65 }
          },
          {
            id: 'madeira',
            proj4:
              '+proj=utm +zone=28 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
            bounds: [
              [-17.28, 32.62],
              [-16.27, 33.14]
            ],
            layout: { x: 0.6, y: 0.8, width: 0.1, height: 0.1 },
            scaleMultiplier: 1.3
          }
        ]
      }
    };
    const metadata = {
      file: 'europe-test',
      title_fr: 'Europe',
      title_en: 'Europe',
      source: 'test',
      date: '2024',
      bbox: [-17.28, 32.62, 42, 71.6],
      proj_source: 'EPSG:4326',
      proj_to: { type: 'composite', preset: 'TEST_EUROPE_DOM_TOM' },
      layers: []
    } as BasemapMetadata;
    const projection = buildCompositeProjectionFromPresetId(
      'TEST_EUROPE_DOM_TOM',
      1000,
      500,
      presets
    );

    if (!projection) {
      throw new Error('Expected test composite projection');
    }

    const mainlandProjectedBbox = computeProjectedBboxForProjection(
      projection,
      [-11.0, 34.5, 42.0, 71.6]
    );
    const compositeProjectedBbox = computeProjectedBboxForBasemap(
      metadata,
      presets,
      1000,
      500
    );

    expect(mainlandProjectedBbox).not.toBeNull();
    expect(compositeProjectedBbox).not.toBeNull();
    expect(compositeProjectedBbox?.[3]).toBeGreaterThan(
      mainlandProjectedBbox?.[3] ?? 0
    );
  });
});

describe('projectGeoJSON through a rotated projection', () => {
  function boxRing(
    lonMin: number,
    lonMax: number,
    latMin: number,
    latMax: number,
    step = 2
  ): GeoJSON.Position[] {
    const ring: GeoJSON.Position[] = [];
    for (let lon = lonMin; lon < lonMax; lon += step) ring.push([lon, latMin]);
    for (let lat = latMin; lat < latMax; lat += step) ring.push([lonMax, lat]);
    for (let lon = lonMax; lon > lonMin; lon -= step) ring.push([lon, latMax]);
    for (let lat = latMax; lat > latMin; lat -= step) ring.push([lonMin, lat]);
    ring.push([lonMin, latMin]);
    return ring;
  }

  function geometryWidth(geometry: GeoJSON.Geometry): number {
    let min = Infinity;
    let max = -Infinity;
    const visit = (coords: unknown): void => {
      if (Array.isArray(coords) && typeof coords[0] === 'number') {
        const x = coords[0] as number;
        if (x < min) min = x;
        if (x > max) max = x;
        return;
      }
      if (Array.isArray(coords)) for (const child of coords) visit(child);
    };
    visit((geometry as { coordinates: unknown }).coordinates);
    return max - min;
  }

  it('should split a polygon crossing the rotated antimeridian instead of drawing a full-width band', () => {
    const projection = geoEquirectangular()
      .rotate([54, 0])
      .translate([500, 250])
      .scale(150) as unknown as ProjectionLike;
    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'crossing' },
          geometry: {
            type: 'Polygon',
            coordinates: [boxRing(100, 160, 50, 70)]
          }
        }
      ]
    };

    const projected = projectGeoJSON(collection, projection);

    expect(projected.features).toHaveLength(1);
    const geometry = projected.features[0].geometry;
    expect(geometry.type).toBe('MultiPolygon');
    const parts = (geometry as GeoJSON.MultiPolygon).coordinates;
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const fullWidth = 2 * Math.PI * 150;
    for (const part of parts) {
      const width = geometryWidth({
        type: 'Polygon',
        coordinates: part
      });
      expect(width).toBeLessThan(fullWidth * 0.5);
    }
  });

  it('should split a line crossing the rotated antimeridian into runs', () => {
    const projection = geoEquirectangular()
      .rotate([54, 0])
      .translate([500, 250])
      .scale(150) as unknown as ProjectionLike;
    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: Array.from({ length: 61 }, (_, i) => [100 + i, 55])
          }
        }
      ]
    };

    const projected = projectGeoJSON(collection, projection);

    expect(projected.features).toHaveLength(1);
    const geometry = projected.features[0].geometry;
    expect(geometry.type).toBe('MultiLineString');
    const fullWidth = 2 * Math.PI * 150;
    for (const line of (geometry as GeoJSON.MultiLineString).coordinates) {
      const width = geometryWidth({ type: 'LineString', coordinates: line });
      expect(width).toBeLessThan(fullWidth * 0.5);
    }
  });

  it('should keep a hole attached to its exterior after projection', () => {
    const projection = geoEquirectangular()
      .translate([500, 250])
      .scale(150) as unknown as ProjectionLike;
    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [boxRing(10, 30, 10, 30), boxRing(18, 22, 18, 22)]
          }
        }
      ]
    };

    const projected = projectGeoJSON(collection, projection);

    const geometry = projected.features[0].geometry;
    expect(geometry.type).toBe('MultiPolygon');
    const parts = (geometry as GeoJSON.MultiPolygon).coordinates;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(2);
  });
});
