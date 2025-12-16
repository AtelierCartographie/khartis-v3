import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection,
  Point,
  Polygon
} from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  describeGeojsonStructure,
  isFeature,
  isFeatureArray,
  isFeatureCollection,
  isGeometry,
  isGeometryCollection,
  isRecord,
  normalizeGeojsonInput
} from '../utils/geojson-guards';

describe('GeoJSON Guards', () => {
  describe('isRecord', () => {
    it('should return true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: 'value' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRecord(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isRecord('string')).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });

    it('should return true for arrays (arrays are objects in JS)', () => {
      expect(isRecord([])).toBe(true);
      expect(isRecord([1, 2, 3])).toBe(true);
    });
  });

  describe('isFeatureCollection', () => {
    it('should detect valid FeatureCollection', () => {
      const fc: FeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };
      expect(isFeatureCollection(fc)).toBe(true);
    });

    it('should detect FeatureCollection with features', () => {
      const fc: FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [0, 0] }
          }
        ]
      };
      expect(isFeatureCollection(fc)).toBe(true);
    });

    it('should reject missing type', () => {
      const invalid = { features: [] };
      expect(isFeatureCollection(invalid)).toBe(false);
    });

    it('should reject wrong type', () => {
      const invalid = { type: 'Feature', features: [] };
      expect(isFeatureCollection(invalid)).toBe(false);
    });

    it('should reject missing features array', () => {
      const invalid = { type: 'FeatureCollection' };
      expect(isFeatureCollection(invalid)).toBe(false);
    });

    it('should reject non-array features', () => {
      const invalid = { type: 'FeatureCollection', features: 'not-array' };
      expect(isFeatureCollection(invalid)).toBe(false);
    });

    it('should reject null', () => {
      expect(isFeatureCollection(null)).toBe(false);
    });
  });

  describe('isFeature', () => {
    it('should detect valid Feature with geometry', () => {
      const feature: Feature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [0, 0] }
      };
      expect(isFeature(feature)).toBe(true);
    });

    it('should handle null geometry', () => {
      const feature = {
        type: 'Feature',
        properties: {},
        geometry: null
      } as unknown as Feature;
      expect(isFeature(feature)).toBe(true);
    });

    it('should reject missing type', () => {
      const invalid = { properties: {}, geometry: null };
      expect(isFeature(invalid)).toBe(false);
    });

    it('should reject wrong type', () => {
      const invalid = { type: 'FeatureCollection', properties: {} };
      expect(isFeature(invalid)).toBe(false);
    });

    it('should reject null', () => {
      expect(isFeature(null)).toBe(false);
    });
  });

  describe('isFeatureArray', () => {
    it('should detect array of valid Features', () => {
      const features = [
        { type: 'Feature', properties: {}, geometry: null },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] }
        }
      ] as Feature[];
      expect(isFeatureArray(features)).toBe(true);
    });

    it('should return true for empty array', () => {
      expect(isFeatureArray([])).toBe(true);
    });

    it('should reject array with non-Feature elements', () => {
      const invalid = [{ type: 'Feature' }, { notAFeature: true }];
      expect(isFeatureArray(invalid)).toBe(false);
    });

    it('should reject non-arrays', () => {
      expect(isFeatureArray('not-array')).toBe(false);
      expect(isFeatureArray({})).toBe(false);
    });
  });

  describe('isGeometryCollection', () => {
    it('should detect valid GeometryCollection', () => {
      const gc: GeometryCollection = {
        type: 'GeometryCollection',
        geometries: [{ type: 'Point', coordinates: [0, 0] }]
      };
      expect(isGeometryCollection(gc)).toBe(true);
    });

    it('should detect empty GeometryCollection', () => {
      const gc: GeometryCollection = {
        type: 'GeometryCollection',
        geometries: []
      };
      expect(isGeometryCollection(gc)).toBe(true);
    });

    it('should reject missing geometries array', () => {
      const invalid = { type: 'GeometryCollection' };
      expect(isGeometryCollection(invalid)).toBe(false);
    });

    it('should reject wrong type', () => {
      const invalid = { type: 'Feature', geometries: [] };
      expect(isGeometryCollection(invalid)).toBe(false);
    });
  });

  describe('isGeometry', () => {
    it('should detect Point geometry', () => {
      const point: Point = { type: 'Point', coordinates: [0, 0] };
      expect(isGeometry(point)).toBe(true);
    });

    it('should detect Polygon geometry', () => {
      const polygon: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      };
      expect(isGeometry(polygon)).toBe(true);
    });

    it('should detect LineString geometry', () => {
      const lineString: Geometry = {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1]
        ]
      };
      expect(isGeometry(lineString)).toBe(true);
    });

    it('should detect MultiPoint geometry', () => {
      const multiPoint: Geometry = {
        type: 'MultiPoint',
        coordinates: [
          [0, 0],
          [1, 1]
        ]
      };
      expect(isGeometry(multiPoint)).toBe(true);
    });

    it('should detect MultiPolygon geometry', () => {
      const multiPolygon: Geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0]
            ]
          ]
        ]
      };
      expect(isGeometry(multiPolygon)).toBe(true);
    });

    it('should reject objects without coordinates', () => {
      const invalid = { type: 'Point' };
      expect(isGeometry(invalid)).toBe(false);
    });

    it('should reject non-string type', () => {
      const invalid = { type: 123, coordinates: [0, 0] };
      expect(isGeometry(invalid)).toBe(false);
    });

    it('should reject null', () => {
      expect(isGeometry(null)).toBe(false);
    });
  });

  describe('normalizeGeojsonInput', () => {
    it('should pass through FeatureCollection unchanged', () => {
      const fc = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: null }]
      } as unknown as FeatureCollection;
      const result = normalizeGeojsonInput(fc);
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
    });

    it('should wrap single Feature in FeatureCollection', () => {
      const feature: Feature = {
        type: 'Feature',
        properties: { name: 'test' },
        geometry: { type: 'Point', coordinates: [0, 0] }
      };
      const result = normalizeGeojsonInput(feature);
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
      expect(result.features[0]).toEqual(feature);
    });

    it('should wrap Feature[] in FeatureCollection', () => {
      const features = [
        { type: 'Feature', properties: {}, geometry: null },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [1, 1] }
        }
      ] as Feature[];
      const result = normalizeGeojsonInput(features);
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(2);
    });

    it('should wrap Geometry in Feature and FeatureCollection', () => {
      const point: Point = { type: 'Point', coordinates: [5, 10] };
      const result = normalizeGeojsonInput(point);
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);
      expect(result.features[0].type).toBe('Feature');
      expect(result.features[0].geometry).toEqual(point);
      expect(result.features[0].properties).toEqual({});
    });

    it('should convert GeometryCollection to FeatureCollection', () => {
      const gc: GeometryCollection = {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [0, 0] },
          { type: 'Point', coordinates: [1, 1] }
        ]
      };
      const result = normalizeGeojsonInput(gc);
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(2);
      result.features.forEach((f) => {
        expect(f.type).toBe('Feature');
        expect(f.properties).toEqual({});
      });
    });

    it('should throw for invalid input', () => {
      const invalid = { invalid: 'data' } as never;
      expect(() => normalizeGeojsonInput(invalid)).toThrow();
    });
  });

  describe('describeGeojsonStructure', () => {
    it('should describe FeatureCollection', () => {
      const fc = { type: 'FeatureCollection', features: [] };
      const result = describeGeojsonStructure(fc);
      expect(result.type).toBe('FeatureCollection');
      expect(result.hasFeatures).toBe(true);
      expect(result.isArray).toBe(false);
      expect(result.keys).toContain('type');
      expect(result.keys).toContain('features');
    });

    it('should describe Feature', () => {
      const feature = { type: 'Feature', properties: {}, geometry: null };
      const result = describeGeojsonStructure(feature);
      expect(result.type).toBe('Feature');
      expect(result.hasFeatures).toBe(false);
      expect(result.isArray).toBe(false);
    });

    it('should describe array', () => {
      const arr = [{ type: 'Feature' }];
      const result = describeGeojsonStructure(arr);
      expect(result.isArray).toBe(true);
      expect(result.type).toBeUndefined();
    });

    it('should handle non-object input', () => {
      const result = describeGeojsonStructure('string');
      expect(result.type).toBeUndefined();
      expect(result.hasFeatures).toBe(false);
      expect(result.isArray).toBe(false);
      expect(result.keys).toHaveLength(0);
    });
  });
});
