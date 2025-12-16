import { describe, expect, it } from 'vitest';
import {
  ColumnType,
  computeBoundsArea,
  computeCentroid,
  extractBBox,
  extractGeometryTypes,
  extractPrimaryGeometryType,
  fromDuckDBType,
  getNullPercentage,
  getUniquePercentage,
  hasNumericStats,
  isGeoArrowMetadata,
  isNumericType,
  isSpatialType,
  isTemporalType,
  isValidBounds,
  mergeValidationResults,
  validationFailure,
  validationSuccess,
  type ColumnStats,
  type GeoArrowMetadata
} from '../types';

describe('DuckDB Type Conversion', () => {
  describe('fromDuckDBType', () => {
    const testCases = [
      { duckType: 'BOOLEAN', expected: ColumnType.BOOLEAN },
      { duckType: 'bool', expected: ColumnType.BOOLEAN },
      { duckType: 'DATE', expected: ColumnType.DATE },
      { duckType: 'TIMESTAMP', expected: ColumnType.DATE },
      { duckType: 'TIME', expected: ColumnType.DATE },
      { duckType: 'datetime', expected: ColumnType.DATE },
      { duckType: 'INTEGER', expected: ColumnType.NUMBER },
      { duckType: 'BIGINT', expected: ColumnType.NUMBER },
      { duckType: 'DOUBLE', expected: ColumnType.NUMBER },
      { duckType: 'FLOAT', expected: ColumnType.NUMBER },
      { duckType: 'NUMERIC', expected: ColumnType.NUMBER },
      { duckType: 'GEOMETRY', expected: ColumnType.GEOMETRY },
      { duckType: 'geom', expected: ColumnType.GEOMETRY },
      { duckType: 'VARCHAR', expected: ColumnType.TEXT },
      { duckType: 'STRING', expected: ColumnType.TEXT },
      { duckType: 'UNKNOWN', expected: ColumnType.TEXT }
    ];

    for (const { duckType, expected } of testCases) {
      it(`should convert ${duckType} to ${expected}`, () => {
        expect(fromDuckDBType(duckType)).toBe(expected);
      });
    }
  });

  describe('Type guards', () => {
    it('isNumericType should only match NUMBER', () => {
      expect(isNumericType(ColumnType.NUMBER)).toBe(true);
      expect(isNumericType(ColumnType.TEXT)).toBe(false);
      expect(isNumericType(ColumnType.DATE)).toBe(false);
    });

    it('isTemporalType should only match DATE', () => {
      expect(isTemporalType(ColumnType.DATE)).toBe(true);
      expect(isTemporalType(ColumnType.NUMBER)).toBe(false);
      expect(isTemporalType(ColumnType.TEXT)).toBe(false);
    });

    it('isSpatialType should only match GEOMETRY', () => {
      expect(isSpatialType(ColumnType.GEOMETRY)).toBe(true);
      expect(isSpatialType(ColumnType.TEXT)).toBe(false);
      expect(isSpatialType(ColumnType.NUMBER)).toBe(false);
    });
  });
});

describe('ColumnStats Utilities', () => {
  describe('hasNumericStats', () => {
    it('should return true when all numeric stats present', () => {
      const stats: ColumnStats = {
        name: 'test',
        type: ColumnType.NUMBER,
        count: 100,
        nulls: 5,
        uniques: 50,
        mean: 25.5,
        median: 24.0,
        stdDev: 5.2
      };
      expect(hasNumericStats(stats)).toBe(true);
    });

    it('should return false when any numeric stat is missing', () => {
      const baseStat = {
        name: 'test',
        type: ColumnType.NUMBER,
        count: 100,
        nulls: 5,
        uniques: 50
      };
      expect(hasNumericStats({ ...baseStat, median: 24, stdDev: 5 })).toBe(false);
      expect(hasNumericStats({ ...baseStat, mean: 25, stdDev: 5 })).toBe(false);
      expect(hasNumericStats({ ...baseStat, mean: 25, median: 24 })).toBe(false);
    });
  });

  describe('getNullPercentage', () => {
    it('should calculate correct percentage', () => {
      const stats: ColumnStats = {
        name: 'test',
        type: ColumnType.TEXT,
        count: 100,
        nulls: 25,
        uniques: 50
      };
      expect(getNullPercentage(stats)).toBe(25);
    });

    it('should handle edge cases', () => {
      expect(getNullPercentage({ name: 't', type: ColumnType.TEXT, count: 0, nulls: 0, uniques: 0 })).toBe(0);
      expect(getNullPercentage({ name: 't', type: ColumnType.TEXT, count: 100, nulls: 100, uniques: 0 })).toBe(100);
    });
  });

  describe('getUniquePercentage', () => {
    it('should calculate correct percentage', () => {
      const stats: ColumnStats = {
        name: 'test',
        type: ColumnType.TEXT,
        count: 100,
        nulls: 0,
        uniques: 75
      };
      expect(getUniquePercentage(stats)).toBe(75);
    });

    it('should handle edge cases', () => {
      expect(getUniquePercentage({ name: 't', type: ColumnType.TEXT, count: 0, nulls: 0, uniques: 0 })).toBe(0);
      expect(getUniquePercentage({ name: 't', type: ColumnType.TEXT, count: 100, nulls: 0, uniques: 100 })).toBe(100);
    });
  });
});

describe('Geometry Utilities', () => {
  describe('computeCentroid', () => {
    it('should compute centroid of bounds', () => {
      expect(computeCentroid([-10, -5, 10, 5])).toEqual([0, 0]);
      expect(computeCentroid([0, 0, 100, 50])).toEqual([50, 25]);
    });
  });

  describe('isValidBounds', () => {
    it('should validate correct bounds', () => {
      expect(isValidBounds([-10, -5, 10, 5])).toBe(true);
      expect(isValidBounds([-180, -90, 180, 90])).toBe(true);
    });

    it('should reject invalid bounds', () => {
      expect(isValidBounds([10, -5, -10, 5])).toBe(false);
      expect(isValidBounds([-10, 5, 10, -5])).toBe(false);
      expect(isValidBounds([-200, -5, 10, 5])).toBe(false);
      expect(isValidBounds([-10, -100, 10, 5])).toBe(false);
    });
  });

  describe('computeBoundsArea', () => {
    it('should compute area correctly', () => {
      expect(computeBoundsArea([0, 0, 10, 10])).toBe(100);
      expect(computeBoundsArea([-5, -5, 5, 5])).toBe(100);
      expect(computeBoundsArea([5, 5, 5, 5])).toBe(0);
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
      const merged = mergeValidationResults([validationSuccess(), validationSuccess()]);
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
      expect(isGeoArrowMetadata({ primary_column: 'geometry', columns: {} })).toBe(false);
      expect(isGeoArrowMetadata({ version: '1.0.0', columns: {} })).toBe(false);
      expect(isGeoArrowMetadata({ version: '1.0.0', primary_column: 'geometry' })).toBe(false);
      expect(isGeoArrowMetadata({ version: '1.0.0', primary_column: 'geometry', columns: 'invalid' })).toBe(false);
    });
  });

  describe('extractBBox', () => {
    it('should extract bbox from metadata', () => {
      expect(extractBBox(validMetadata)).toEqual([-180, -90, 180, 90]);
    });

    it('should return undefined for missing column', () => {
      const metadata: GeoArrowMetadata = { version: '1.0.0', primary_column: 'missing', columns: {} };
      expect(extractBBox(metadata)).toBeUndefined();
    });
  });

  describe('extractGeometryTypes', () => {
    it('should extract geometry types', () => {
      expect(extractGeometryTypes(validMetadata)).toEqual(['Point', 'Polygon']);
    });

    it('should return empty array for missing column', () => {
      const metadata: GeoArrowMetadata = { version: '1.0.0', primary_column: 'missing', columns: {} };
      expect(extractGeometryTypes(metadata)).toEqual([]);
    });
  });

  describe('extractPrimaryGeometryType', () => {
    it('should extract first geometry type', () => {
      expect(extractPrimaryGeometryType(validMetadata)).toBe('Point');
    });

    it('should handle edge cases', () => {
      const missing: GeoArrowMetadata = { version: '1.0.0', primary_column: 'missing', columns: {} };
      expect(extractPrimaryGeometryType(missing)).toBeUndefined();

      const empty: GeoArrowMetadata = {
        version: '1.0.0',
        primary_column: 'geometry',
        columns: { geometry: { encoding: 'WKB', geometry_types: [], bbox: [0, 0, 0, 0] } }
      };
      expect(extractPrimaryGeometryType(empty)).toBeUndefined();
    });
  });
});
