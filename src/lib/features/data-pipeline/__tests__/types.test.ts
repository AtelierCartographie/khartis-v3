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
  });
});

describe('Geometry Utilities', () => {
  describe('computeCentroid', () => {
    it('should compute centroid of bounds', () => {
      expect(computeCentroid([-10, -5, 10, 5])).toEqual([0, 0]);
      expect(computeCentroid([0, 0, 100, 50])).toEqual([50, 25]);
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
