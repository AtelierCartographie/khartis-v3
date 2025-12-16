import { describe, expect, it } from 'vitest';
import { validateFile, validateFileExtension } from '../core/validators';
import { PIPELINE_CONST } from '../constants';
import {
  CSV_TEST_FILES,
  GEOJSON_TEST_FILES,
  ZIP_TEST_FILES,
  loadTestFile,
  getFileStats
} from './test-file-loader';

describe('Pipeline Integration - CSV Validation', () => {
  describe('Valid CSV Files', () => {
    it('should validate fossil-fuel-subsidies CSV', async () => {
      const file = loadTestFile(CSV_TEST_FILES.VALID.FOSSIL_FUEL);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate naissances-par-commune CSV', async () => {
      const file = loadTestFile(CSV_TEST_FILES.VALID.NAISSANCES);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate sites-seveso-idf CSV', async () => {
      const file = loadTestFile(CSV_TEST_FILES.VALID.SEVESO);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate world-bank-rural-pop CSV', async () => {
      const file = loadTestFile(CSV_TEST_FILES.VALID.WORLD_BANK);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Malformed CSV Files', () => {
    it('should validate CSV with 100 columns', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.COLUMNS_100);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with duplicated column names', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.DUPLICATED_NAMES);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with empty columns', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.EMPTY_COLUMNS);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with empty lines', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.EMPTY_LINES);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with European numeric format', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.EUROPEAN_FORMAT);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with header only', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.HEADER_ONLY);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should reject completely empty CSV', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.NOTHING);
      const result = await validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate CSV with null variations', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.NULL_VARIATIONS);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with numeric edge cases', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.NUMERIC_EDGE);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with mixed numeric formats', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.NUMERIC_MIXED);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });

    it('should validate CSV with special characters', async () => {
      const file = loadTestFile(CSV_TEST_FILES.MALFORMED.SPECIAL_CHARS);
      const result = await validateFile(file);

      expect(result.isValid).toBe(true);
    });
  });
});

describe('Pipeline Integration - GeoJSON Validation', () => {
  it('should validate STAR lines GeoJSON', async () => {
    const file = loadTestFile(GEOJSON_TEST_FILES.STAR_LINES);
    const result = await validateFile(file);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate NUTS2 GeoJSON', async () => {
    const file = loadTestFile(GEOJSON_TEST_FILES.NUTS2);
    const result = await validateFile(file);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Pipeline Integration - ZIP Validation', () => {
  it('should validate single-csv ZIP', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SINGLE_CSV);
    const result = await validateFile(file);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate multiple-csv ZIP', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.MULTIPLE_CSV);
    const result = await validateFile(file);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate shapefile-complete ZIP', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SHAPEFILE);
    const result = await validateFile(file);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Pipeline Integration - Extension Validation', () => {
  const allowedExtensions = PIPELINE_CONST.EXTENSIONS
    .ALL as unknown as string[];

  it('should accept all valid CSV test files', () => {
    Object.values(CSV_TEST_FILES.VALID).forEach((path) => {
      const file = loadTestFile(path);
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });
  });

  it('should accept all malformed CSV test files', () => {
    Object.values(CSV_TEST_FILES.MALFORMED).forEach((path) => {
      const file = loadTestFile(path);
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });
  });

  it('should accept GeoJSON test files', () => {
    Object.values(GEOJSON_TEST_FILES).forEach((path) => {
      const file = loadTestFile(path);
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });
  });

  it('should accept ZIP test files', () => {
    Object.values(ZIP_TEST_FILES).forEach((path) => {
      const file = loadTestFile(path);
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });
  });
});

describe('Pipeline Integration - File Stats', () => {
  it('should have reasonable file sizes for CSV test files', () => {
    Object.values(CSV_TEST_FILES.VALID).forEach((path) => {
      const stats = getFileStats(`tests-datasets/${path}`);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.size).toBeLessThan(50 * 1024 * 1024); // < 50MB
    });
  });

  it('should have reasonable file sizes for GeoJSON test files', () => {
    Object.values(GEOJSON_TEST_FILES).forEach((path) => {
      const stats = getFileStats(`tests-datasets/${path}`);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.size).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
