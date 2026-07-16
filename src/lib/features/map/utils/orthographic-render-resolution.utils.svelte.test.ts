import { Table, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import type { LngLatBoundsLike } from 'maplibre-gl';
import type { DatasetResult } from '$lib/features/data-pipeline';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  resolveOrthographicBasemapReferenceState,
  resolveOrthographicReferenceState,
  resolveOrthographicRenderedDatasetBounds,
  toBboxFromOrthographicBounds,
  toOrthographicBounds
} from './orthographic-render-resolution.utils';

const viewportSize = { width: 800, height: 600 };

const basemapMeta: BasemapMetadata = {
  file: 'world.geojson',
  title_fr: 'World',
  title_en: 'World',
  source: 'test',
  date: '2024',
  bbox: [-10, -20, 30, 40],
  proj_source: 'EPSG:4326',
  proj_to: { type: 'identity' },
  layers: []
};

describe('orthographic render resolution utils', () => {
  it('normalizes supported bounds shapes', () => {
    expect(toOrthographicBounds([1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4]
    ]);
    expect(
      toOrthographicBounds({
        toArray: () => [
          [5, 6],
          [7, 8]
        ]
      } as unknown as LngLatBoundsLike)
    ).toEqual([
      [5, 6],
      [7, 8]
    ]);
  });

  it('converts orthographic bounds to bbox tuples', () => {
    expect(
      toBboxFromOrthographicBounds([
        [1, 2],
        [3, 4]
      ])
    ).toEqual([1, 2, 3, 4]);
    expect(toBboxFromOrthographicBounds(null)).toBeNull();
  });

  it('prefers dataset bbox when requested', () => {
    const state = resolveOrthographicReferenceState({
      dataset: null,
      bounds: [
        [1, 2],
        [3, 4]
      ],
      basemapMeta,
      shouldUseBasemapReference: true,
      renderProjection: null,
      projectionPresets: null,
      viewportSize,
      preferDatasetBbox: true
    });

    expect(state).toEqual({
      bbox: [1, 2, 3, 4],
      isProjected: false,
      renderProjection: null
    });
  });

  describe('resolveOrthographicRenderedDatasetBounds', () => {
    const lambert93Bounds: [number, number, number, number] = [
      700000, 6100000, 800000, 6200000
    ];

    function makeDataset(crs: string): Pick<DatasetResult, 'geometry'> {
      return {
        geometry: {
          type: 'Polygon',
          bounds: lambert93Bounds,
          crs
        }
      };
    }

    function makeWgs84Table(): Table {
      return new Table({
        geom: vectorFromArray([
          JSON.stringify({
            type: 'LineString',
            coordinates: [
              [3.2, 43.4],
              [3.8, 43.9]
            ]
          })
        ])
      });
    }

    it('measures the WGS84-reprojected table under a manual projection on a non-WGS84 dataset', () => {
      const bounds = resolveOrthographicRenderedDatasetBounds({
        dataset: makeDataset('EPSG:2154'),
        renderedTable: makeWgs84Table(),
        hasManualProjectionOverride: true
      });

      expect(bounds).toEqual([
        [3.2, 43.4],
        [3.8, 43.9]
      ]);
    });

    it('never falls back to source-CRS bounds when the reprojected table is not loaded yet', () => {
      const bounds = resolveOrthographicRenderedDatasetBounds({
        dataset: makeDataset('EPSG:2154'),
        renderedTable: null,
        hasManualProjectionOverride: true
      });

      expect(bounds).toBeNull();
    });

    it('uses import-time bounds for a non-WGS84 dataset rendered in its source CRS', () => {
      const bounds = resolveOrthographicRenderedDatasetBounds({
        dataset: makeDataset('EPSG:2154'),
        renderedTable: makeWgs84Table(),
        hasManualProjectionOverride: false
      });

      expect(bounds).toEqual([
        [700000, 6100000],
        [800000, 6200000]
      ]);
    });

    it('uses import-time bounds for a WGS84 dataset regardless of projection override', () => {
      const wgs84Dataset: Pick<DatasetResult, 'geometry'> = {
        geometry: {
          type: 'Polygon',
          bounds: [-5, 41, 9, 51],
          crs: 'EPSG:4326'
        }
      };

      const bounds = resolveOrthographicRenderedDatasetBounds({
        dataset: wgs84Dataset,
        renderedTable: makeWgs84Table(),
        hasManualProjectionOverride: true
      });

      expect(bounds).toEqual([
        [-5, 41],
        [9, 51]
      ]);
    });
  });

  it('falls back to basemap metadata bbox for basemap references', () => {
    const state = resolveOrthographicBasemapReferenceState({
      basemapMeta,
      basemapTable: null,
      renderProjection: null,
      projectionPresets: null,
      viewportSize
    });

    expect(state).toEqual({
      bbox: basemapMeta.bbox,
      isProjected: false,
      renderProjection: null
    });
  });
});
