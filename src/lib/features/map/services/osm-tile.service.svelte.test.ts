import { describe, expect, it } from 'vitest';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  createOSMRasterLayer,
  createOSMRasterSource,
  getOSMTileConfig,
  isOSMBasemap,
  isOSMBasemapFileId,
  type OSMTileConfig
} from './osm-tile.service';

function createBasemap(file: string): BasemapMetadata {
  return {
    file,
    title_fr: 'Fond OSM',
    title_en: 'OSM basemap',
    source: 'OpenStreetMap',
    date: '2026-04-09',
    bbox: [-180, -85, 180, 85],
    proj_source: 'EPSG:3857',
    proj_to: {
      type: 'simple'
    },
    layers: [],
    isCustom: true
  };
}

describe('OSM tile service', () => {
  it('identifies generated OSM basemap ids', () => {
    expect(isOSMBasemapFileId('osm_monde-couleurs_123')).toBe(true);
    expect(isOSMBasemapFileId('monde-countries-2024-medium')).toBe(false);
  });

  it('identifies OSM basemap metadata', () => {
    expect(isOSMBasemap(createBasemap('osm_standard_123'))).toBe(true);
    expect(isOSMBasemap(createBasemap('france-region-2025-high'))).toBe(false);
    expect(isOSMBasemap(null)).toBe(false);
  });

  it('keeps style-backed OSM basemaps out of the raster overlay path', () => {
    expect(
      getOSMTileConfig(createBasemap('osm_monde-couleurs_123'))
    ).toBeNull();
  });

  it('supports explicit raster tile config when metadata provides one', () => {
    const tileConfig: OSMTileConfig = {
      urlTemplate: 'https://example.test/{z}/{x}/{y}.png',
      attribution: 'Example tiles',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256
    };
    const basemap = {
      ...createBasemap('osm_raster_123'),
      osmTileConfig: tileConfig
    };

    expect(getOSMTileConfig(basemap)).toEqual(tileConfig);
    expect(createOSMRasterSource(tileConfig)).toEqual({
      type: 'raster',
      tiles: [tileConfig.urlTemplate],
      tileSize: tileConfig.tileSize,
      attribution: tileConfig.attribution,
      minzoom: tileConfig.minZoom,
      maxzoom: tileConfig.maxZoom
    });
    expect(createOSMRasterLayer('osm-raster-source')).toEqual({
      id: 'osm-raster-source-layer',
      type: 'raster',
      source: 'osm-raster-source',
      paint: {
        'raster-opacity': 1
      }
    });
  });
});
