import { describe, expect, it } from 'vitest';
import {
  createOSMRasterLayer,
  createOSMRasterSource,
  extractOSMStyle,
  getOSMTileConfig,
  isOSMBasemap
} from './osm-tile.service';
import type { BasemapMetadata } from '../types/basemap.types';

describe('osm-tile.service', () => {
  describe('isOSMBasemap', () => {
    it('returns false for null basemap', () => {
      expect(isOSMBasemap(null)).toBe(false);
    });

    it('returns true for basemap with file starting with osm_', () => {
      const basemap: BasemapMetadata = {
        file: 'osm_standard_1234567890',
        title: 'Test',
        description: 'Test',
        source: 'Test',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      expect(isOSMBasemap(basemap)).toBe(true);
    });

    it('returns false for non-OSM basemap', () => {
      const basemap: BasemapMetadata = {
        file: 'custom_basemap_123',
        title: 'Test',
        description: 'Test',
        source: 'Test',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      expect(isOSMBasemap(basemap)).toBe(false);
    });
  });

  describe('extractOSMStyle', () => {
    it('extracts style from valid OSM basemap ID', () => {
      expect(extractOSMStyle('osm_standard_1234567890')).toBe('standard');
      expect(extractOSMStyle('osm_carto_9876543210')).toBe('carto');
    });

    it('returns null for invalid OSM basemap ID', () => {
      expect(extractOSMStyle('invalid_id')).toBeNull();
      expect(extractOSMStyle('osm_invalid')).toBeNull();
    });
  });

  describe('getOSMTileConfig', () => {
    it('returns config for standard OSM style', () => {
      const basemap: BasemapMetadata = {
        file: 'osm_standard_1234567890',
        title: 'Standard',
        description: 'Test',
        source: 'Test',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      const config = getOSMTileConfig(basemap);
      expect(config).not.toBeNull();
      expect(config?.urlTemplate).toBe(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      );
    });

    it('returns config for carto OSM style', () => {
      const basemap: BasemapMetadata = {
        file: 'osm_carto_1234567890',
        title: 'Carto',
        description: 'Test',
        source: 'Test',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      const config = getOSMTileConfig(basemap);
      expect(config).not.toBeNull();
      expect(config?.urlTemplate).toContain('cartocdn.com');
      expect(config?.attribution).toContain('CARTO');
    });

    it('returns config for humanitarian OSM style', () => {
      const basemap: BasemapMetadata = {
        file: 'osm_humanitarian_1234567890',
        title: 'Humanitarian',
        description: 'Test',
        source: 'Test',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      const config = getOSMTileConfig(basemap);
      expect(config).not.toBeNull();
      expect(config?.urlTemplate).not.toContain('{s}');
      expect(config?.urlTemplate).toContain('openstreetmap.fr/hot');
    });

    it('returns null for unknown style', () => {
      const basemap: BasemapMetadata = {
        file: 'osm_unknown_1234567890',
        title: 'Unknown',
        description: 'Test',
        source: 'Test',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      const config = getOSMTileConfig(basemap);
      expect(config).toBeNull();
    });
  });

  describe('createOSMRasterSource', () => {
    it('creates valid MapLibre raster source', () => {
      const config = {
        urlTemplate: 'https://example.com/{z}/{x}/{y}.png',
        attribution: 'Test Attribution',
        minZoom: 0,
        maxZoom: 18,
        tileSize: 256
      };
      const source = createOSMRasterSource(config);
      expect(source.type).toBe('raster');
      expect(source.tiles).toEqual(['https://example.com/{z}/{x}/{y}.png']);
      expect(source.tileSize).toBe(256);
      expect(source.attribution).toBe('Test Attribution');
      expect(source.minzoom).toBe(0);
      expect(source.maxzoom).toBe(18);
    });
  });

  describe('createOSMRasterLayer', () => {
    it('creates valid MapLibre raster layer', () => {
      const layer = createOSMRasterLayer('test-source');
      expect(layer.id).toBe('test-source-layer');
      expect(layer.type).toBe('raster');
      expect(layer.source).toBe('test-source');
      expect(layer.paint).toEqual({ 'raster-opacity': 1 });
    });
  });

  describe('OSM_TILE_SERVERS configuration', () => {
    it('all tile servers have valid URLs without subdomain placeholders', () => {
      const basemap: BasemapMetadata = {
        file: '',
        title: '',
        description: '',
        source: '',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };

      const styles = ['standard', 'carto', 'humanitarian', 'transport'];

      for (const style of styles) {
        basemap.file = `osm_${style}_1234567890`;
        const config = getOSMTileConfig(basemap);
        expect(
          config,
          `Config for style ${style} should not be null`
        ).not.toBeNull();
        expect(
          config?.urlTemplate,
          `URL for style ${style} should not contain {s} placeholder`
        ).not.toContain('{s}');
        expect(
          config?.urlTemplate,
          `URL for style ${style} should be HTTPS`
        ).toMatch(/^https:\/\//);
      }
    });

    it('carto style uses different URL than standard', () => {
      const standardBasemap: BasemapMetadata = {
        file: 'osm_standard_123',
        title: '',
        description: '',
        source: '',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };
      const cartoBasemap: BasemapMetadata = {
        file: 'osm_carto_123',
        title: '',
        description: '',
        source: '',
        date: '2024',
        bbox: [-180, -90, 180, 90],
        projection: 'EPSG:3857',
        layers: [],
        isCustom: true
      };

      const standardConfig = getOSMTileConfig(standardBasemap);
      const cartoConfig = getOSMTileConfig(cartoBasemap);

      expect(standardConfig?.urlTemplate).not.toBe(cartoConfig?.urlTemplate);
    });
  });
});
