import { describe, expect, it } from 'vitest';
import type { GeoStream } from 'd3-geo';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type { FeatureCollection, Point } from 'geojson';
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
});
