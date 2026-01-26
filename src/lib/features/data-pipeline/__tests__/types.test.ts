import { describe, expect, it } from 'vitest';
import {
  ColumnType,
  computeCentroid,
  fromDuckDBType,
  isGeoArrowMetadata,
  isNumericType,
  mergeValidationResults,
  validationFailure,
  validationSuccess,
  type GeoArrowMetadata
} from '../types';

describe('DuckDB Type Conversion', () => {
  describe('fromDuckDBType', () => {
    it('should convert DuckDB types to internal types', () => {
      expect(fromDuckDBType('BOOLEAN')).toBe(ColumnType.BOOLEAN);
      expect(fromDuckDBType('DATE')).toBe(ColumnType.DATE);
      expect(fromDuckDBType('INTEGER')).toBe(ColumnType.NUMBER);
      expect(fromDuckDBType('GEOMETRY')).toBe(ColumnType.GEOMETRY);
      expect(fromDuckDBType('VARCHAR')).toBe(ColumnType.TEXT);
    });

    it('should handle case variations', () => {
      expect(fromDuckDBType('bool')).toBe(ColumnType.BOOLEAN);
      expect(fromDuckDBType('geom')).toBe(ColumnType.GEOMETRY);
    });

    it('should default unknown types to TEXT', () => {
      expect(fromDuckDBType('UNKNOWN')).toBe(ColumnType.TEXT);
      expect(fromDuckDBType('INVALID_TYPE')).toBe(ColumnType.TEXT);
    });
  });

  describe('Type guards', () => {
    it('isNumericType should only match NUMBER', () => {
      expect(isNumericType(ColumnType.NUMBER)).toBe(true);
      expect(isNumericType(ColumnType.TEXT)).toBe(false);
      expect(isNumericType(ColumnType.DATE)).toBe(false);
    });
  });
});

describe('Geometry Utilities', () => {
  describe('computeCentroid', () => {
    it('should compute centroid of bounds', () => {
      expect(computeCentroid([-10, -5, 10, 5])).toEqual([0, 0]);
      expect(computeCentroid([0, 0, 100, 50])).toEqual([50, 25]);
    });

    it('should handle negative coordinates', () => {
      expect(computeCentroid([-100, -50, -10, -5])).toEqual([-55, -27.5]);
    });

    it('should handle zero-dimension bounds', () => {
      expect(computeCentroid([0, 0, 0, 0])).toEqual([0, 0]);
      expect(computeCentroid([5, 5, 5, 5])).toEqual([5, 5]);
    });

    it('should handle large coordinates', () => {
      expect(computeCentroid([1000000, 6000000, 1200000, 7200000])).toEqual([
        1100000, 6600000
      ]);
    });
  });
});

describe('Validation Utilities', () => {
  describe('validationSuccess/validationFailure', () => {
    it('should create success result', () => {
      const result = validationSuccess();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should create success with warnings', () => {
      const result = validationSuccess(['warning']);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('warning');
    });

    it('should create failure result', () => {
      const result = validationFailure(['error']);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('error');
    });
  });

  describe('mergeValidationResults', () => {
    it('should merge all valid results', () => {
      const merged = mergeValidationResults([
        validationSuccess(),
        validationSuccess()
      ]);
      expect(merged.isValid).toBe(true);
    });

    it('should merge mixed results (invalid wins)', () => {
      const merged = mergeValidationResults([
        validationSuccess(['warning']),
        validationFailure(['error'])
      ]);
      expect(merged.isValid).toBe(false);
      expect(merged.errors).toContain('error');
      expect(merged.warnings).toContain('warning');
    });

    it('should collect all errors and warnings', () => {
      const merged = mergeValidationResults([
        validationFailure(['error1'], ['warning1']),
        validationFailure(['error2'], ['warning2'])
      ]);
      expect(merged.errors).toHaveLength(2);
      expect(merged.warnings).toHaveLength(2);
    });
  });
});

describe('GeoArrow Metadata', () => {
  const validMetadata: GeoArrowMetadata = {
    version: '1.0.0',
    primary_column: 'geometry',
    columns: {
      geometry: {
        encoding: 'WKB',
        geometry_types: ['Point', 'Polygon'],
        bbox: [-180, -90, 180, 90]
      }
    }
  };

  describe('isGeoArrowMetadata', () => {
    it('should validate correct metadata', () => {
      expect(isGeoArrowMetadata(validMetadata)).toBe(true);
    });

    it('should reject invalid metadata', () => {
      expect(isGeoArrowMetadata(null)).toBe(false);
      expect(
        isGeoArrowMetadata({ primary_column: 'geometry', columns: {} })
      ).toBe(false);
      expect(isGeoArrowMetadata({ version: '1.0.0', columns: {} })).toBe(false);
      expect(
        isGeoArrowMetadata({ version: '1.0.0', primary_column: 'geometry' })
      ).toBe(false);
      expect(
        isGeoArrowMetadata({
          version: '1.0.0',
          primary_column: 'geometry',
          columns: 'invalid'
        })
      ).toBe(false);
    });
  });
});
