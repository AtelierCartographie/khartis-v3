import { describe, expect, it } from 'vitest';
import { geoOrthographic } from 'd3-geo';
import type { GeoStream } from 'd3-geo';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import {
  computeProjectedBboxForProjection,
  projectGeoJSON
} from '$lib/features/map/utils/geoarrow-stream-bridge';

describe('computeProjectedBboxForProjection', () => {
  it('supports projections that are sampled through stream()', () => {
    const streamOnlyProjection = {
      stream(sink: GeoStream): GeoStream {
        return {
          point(x: number, y: number): void {
            sink.point(x + 1, y + 2);
          },
          lineStart(): void {
            sink.lineStart();
          },
          lineEnd(): void {
            sink.lineEnd();
          },
          polygonStart(): void {
            sink.polygonStart?.();
          },
          polygonEnd(): void {
            sink.polygonEnd?.();
          }
        };
      }
    } as unknown as ProjectionLike;

    expect(
      computeProjectedBboxForProjection(streamOnlyProjection, [0, 0, 10, 10])
    ).toEqual([1, 2, 11, 12]);
  });

  it('samples clipped projection interiors so world orthographic bboxes stay non-degenerate', () => {
    const projection = geoOrthographic()
      .fitExtent(
        [
          [40, 40],
          [920, 560]
        ],
        { type: 'Sphere' }
      )
      .clipAngle(90);

    const bbox = computeProjectedBboxForProjection(
      projection,
      [-180, -90, 180, 90]
    );

    expect(bbox).not.toBeNull();
    expect(bbox![2] - bbox![0]).toBeGreaterThan(0);
    expect(bbox![3] - bbox![1]).toBeGreaterThan(0);
  });

  it('projects GeoJSON through stream() and drops clipped features', () => {
    const streamOnlyProjection = {
      stream(sink: GeoStream): GeoStream {
        return {
          point(x: number, y: number): void {
            if (x < 0) {
              return;
            }
            sink.point(x + 1, y + 2);
          },
          lineStart(): void {
            sink.lineStart();
          },
          lineEnd(): void {
            sink.lineEnd();
          },
          polygonStart(): void {
            sink.polygonStart?.();
          },
          polygonEnd(): void {
            sink.polygonEnd?.();
          }
        };
      }
    } as unknown as ProjectionLike;

    const source: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'keep' },
          geometry: { type: 'Point', coordinates: [2, 3] }
        },
        {
          type: 'Feature',
          properties: { id: 'drop' },
          geometry: { type: 'Point', coordinates: [-2, 1] }
        }
      ]
    };

    expect(projectGeoJSON(source, streamOnlyProjection)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'keep' },
          geometry: { type: 'Point', coordinates: [3, 5] }
        }
      ]
    });
  });

  it('drops projected polygons when any ring coordinate is clipped', () => {
    const streamOnlyProjection = {
      stream(sink: GeoStream): GeoStream {
        return {
          point(x: number, y: number): void {
            if (x < 0) {
              return;
            }
            sink.point(x + 10, y + 20);
          },
          lineStart(): void {
            sink.lineStart();
          },
          lineEnd(): void {
            sink.lineEnd();
          },
          polygonStart(): void {
            sink.polygonStart?.();
          },
          polygonEnd(): void {
            sink.polygonEnd?.();
          }
        };
      }
    } as unknown as ProjectionLike;

    const source: FeatureCollection<Polygon> = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'keep' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 0]
              ]
            ]
          }
        },
        {
          type: 'Feature',
          properties: { id: 'drop' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-1, 0],
                [1, 0],
                [1, 1],
                [-1, 0]
              ]
            ]
          }
        }
      ]
    };

    expect(projectGeoJSON(source, streamOnlyProjection)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'keep' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [10, 20],
                [12, 20],
                [12, 22],
                [10, 20]
              ]
            ]
          }
        }
      ]
    });
  });
});
