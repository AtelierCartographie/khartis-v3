import { describe, it, expect } from 'vitest';
import {
  get_bbox_from_geoparquet,
  get_bbox_center,
  get_max_scale,
  get_model_matrix
} from './projscreen';

describe('projscreen', () => {
  const validGeoParquetMeta = JSON.stringify({
    primary_column: 'geometry',
    columns: {
      geometry: {
        bbox: [100000, 6000000, 1200000, 7200000],
        geometry_types: ['Polygon']
      }
    }
  });

  describe('get_bbox_from_geoparquet', () => {
    it('should extract bbox from valid metadata', () => {
      const bbox = get_bbox_from_geoparquet(validGeoParquetMeta);
      expect(bbox).toEqual([100000, 6000000, 1200000, 7200000]);
    });

    it('should extract bbox from specified column', () => {
      const bbox = get_bbox_from_geoparquet(validGeoParquetMeta, 'geometry');
      expect(bbox).toEqual([100000, 6000000, 1200000, 7200000]);
    });

    it('should return null for invalid JSON', () => {
      const bbox = get_bbox_from_geoparquet('invalid json');
      expect(bbox).toBeNull();
    });

    it('should return null for missing column', () => {
      const bbox = get_bbox_from_geoparquet(validGeoParquetMeta, 'nonexistent');
      expect(bbox).toBeNull();
    });

    it('should return null for missing bbox in column', () => {
      const metaWithoutBbox = JSON.stringify({
        primary_column: 'geometry',
        columns: {
          geometry: {
            geometry_types: ['Polygon']
          }
        }
      });
      const bbox = get_bbox_from_geoparquet(metaWithoutBbox);
      expect(bbox).toBeNull();
    });
  });

  describe('get_bbox_center', () => {
    it('should calculate center for Lambert 93 bbox', () => {
      const center = get_bbox_center([100000, 6000000, 1200000, 7200000]);
      expect(center).toEqual([650000, 6600000]);
    });

    it('should calculate center for WGS84 bbox', () => {
      const center = get_bbox_center([-5.5, 41.3, 9.6, 51.1]);
      expect(center[0]).toBeCloseTo(2.05, 1);
      expect(center[1]).toBeCloseTo(46.2, 1);
    });
  });

  describe('get_max_scale', () => {
    it('should calculate scale for landscape canvas', () => {
      const scale = get_max_scale(
        { width: 1200, height: 800 },
        [0, 0, 1100000, 1200000]
      );
      expect(scale).toBeCloseTo((800 / 1200000) * 0.97, 10);
    });

    it('should calculate scale for portrait canvas', () => {
      const scale = get_max_scale(
        { width: 800, height: 1200 },
        [0, 0, 1100000, 1200000]
      );
      expect(scale).toBeCloseTo((800 / 1100000) * 0.97, 10);
    });

    it('should return 1 for zero-dimension bbox', () => {
      const scale = get_max_scale({ width: 800, height: 600 }, [0, 0, 0, 0]);
      expect(scale).toBe(1);
    });
  });

  describe('get_model_matrix', () => {
    it('should return Matrix4 for valid local projection metadata', () => {
      const matrix = get_model_matrix(validGeoParquetMeta, {
        width: 1200,
        height: 800
      });
      expect(matrix).not.toBeNull();
      expect(matrix).toHaveProperty('scale');
      expect(matrix).toHaveProperty('translate');
    });

    it('should return null for invalid metadata', () => {
      const matrix = get_model_matrix('invalid', { width: 800, height: 600 });
      expect(matrix).toBeNull();
    });

    it('should return null for missing bbox', () => {
      const metaWithoutBbox = JSON.stringify({
        primary_column: 'geometry',
        columns: { geometry: {} }
      });
      const matrix = get_model_matrix(metaWithoutBbox, {
        width: 800,
        height: 600
      });
      expect(matrix).toBeNull();
    });
  });
});
