import { describe, expect, it } from 'vitest';
import type { LngLatBoundsLike } from 'maplibre-gl';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  resolveOrthographicBasemapReferenceState,
  resolveOrthographicReferenceState,
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
