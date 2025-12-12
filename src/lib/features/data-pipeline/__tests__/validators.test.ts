import { describe, expect, it } from 'vitest';
import { PIPELINE_CONST } from '../constants';
import {
  validateFile,
  validateFileExtension,
  validateMimeType
} from '../core/validators';

describe('File Validators', () => {
  describe('validateFile', () => {
    it('should reject empty file (size === 0)', async () => {
      const emptyFile = new File([], 'empty.csv', { type: 'text/csv' });
      const result = await validateFile(emptyFile);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject file exceeding MAX_FILE_SIZE (100MB)', async () => {
      const largeContent = new Uint8Array(101 * 1024 * 1024);
      const largeFile = new File([largeContent], 'large.csv', {
        type: 'text/csv'
      });
      const result = await validateFile(largeFile);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn for file above WARNING_FILE_SIZE (50MB)', async () => {
      const mediumContent = new Uint8Array(51 * 1024 * 1024);
      const mediumFile = new File([mediumContent], 'medium.csv', {
        type: 'text/csv'
      });
      const result = await validateFile(mediumFile);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should accept valid file under limits', async () => {
      const validContent = 'id,name,value\n1,test,100\n2,test2,200';
      const validFile = new File([validContent], 'valid.csv', {
        type: 'text/csv'
      });
      const result = await validateFile(validFile);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should accept file exactly at WARNING_FILE_SIZE without warning', async () => {
      const exactContent = new Uint8Array(50 * 1024 * 1024);
      const exactFile = new File([exactContent], 'exact50mb.csv', {
        type: 'text/csv'
      });
      const result = await validateFile(exactFile);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateFileExtension', () => {
    const allowedExtensions = PIPELINE_CONST.EXTENSIONS.ALL as unknown as string[];

    it('should accept supported CSV extension', () => {
      const file = new File(['data'], 'test.csv', { type: 'text/csv' });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept supported GeoJSON extension', () => {
      const file = new File(['{}'], 'map.geojson', {
        type: 'application/geo+json'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept supported Shapefile extension', () => {
      const file = new File([], 'regions.shp', {
        type: 'application/octet-stream'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept supported GeoPackage extension', () => {
      const file = new File([], 'data.gpkg', {
        type: 'application/geopackage+sqlite3'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept supported GPX extension', () => {
      const file = new File([], 'track.gpx', { type: 'application/gpx+xml' });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept supported ZIP extension', () => {
      const file = new File([], 'archive.zip', { type: 'application/zip' });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept supported Parquet extension', () => {
      const file = new File([], 'data.parquet', {
        type: 'application/octet-stream'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should accept uppercase extensions', () => {
      const file = new File(['data'], 'TEST.CSV', { type: 'text/csv' });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(true);
    });

    it('should reject unsupported extension', () => {
      const file = new File(['data'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('.xlsx');
    });

    it('should reject executable files', () => {
      const file = new File([], 'malware.exe', {
        type: 'application/octet-stream'
      });
      const result = validateFileExtension(file, allowedExtensions);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('.exe');
    });
  });

  describe('validateMimeType', () => {
    const csvMimeTypes = [...PIPELINE_CONST.MIME_TYPES.CSV] as string[];
    const jsonMimeTypes = [...PIPELINE_CONST.MIME_TYPES.JSON] as string[];

    it('should accept text/csv MIME type', () => {
      const file = new File(['data'], 'test.csv', { type: 'text/csv' });
      const result = validateMimeType(file, csvMimeTypes);
      expect(result.isValid).toBe(true);
    });

    it('should accept text/plain MIME type for CSV', () => {
      const file = new File(['data'], 'test.csv', { type: 'text/plain' });
      const result = validateMimeType(file, csvMimeTypes);
      expect(result.isValid).toBe(true);
    });

    it('should accept application/json MIME type', () => {
      const file = new File(['{}'], 'test.json', { type: 'application/json' });
      const result = validateMimeType(file, jsonMimeTypes);
      expect(result.isValid).toBe(true);
    });

    it('should accept application/geo+json MIME type', () => {
      const file = new File(['{}'], 'test.geojson', {
        type: 'application/geo+json'
      });
      const result = validateMimeType(file, jsonMimeTypes);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid MIME type', () => {
      const file = new File(['data'], 'test.csv', {
        type: 'application/octet-stream'
      });
      const result = validateMimeType(file, csvMimeTypes);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
