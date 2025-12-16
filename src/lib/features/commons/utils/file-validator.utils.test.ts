import { describe, it, expect } from 'vitest';
import { FileValidator, FILE_VALIDATION_CONFIG } from './file-validator.utils';
import { FileType } from '../store/create-project.types';
import { STORAGE_LIMITS } from '../configs/validation.config';

// Mock FileReader for Node environment
if (typeof FileReader === 'undefined') {
  global.FileReader = class FileReader {
    result: ArrayBuffer | string | null = null;

    error: Error | null = null;

    onload: ((this: FileReader, ev: ProgressEvent) => void) | null = null;

    onerror: ((this: FileReader, ev: ProgressEvent) => void) | null = null;

    readAsArrayBuffer(blob: Blob) {
      // Simulate async read
      setTimeout(async () => {
        try {
          // Convert blob to ArrayBuffer
          const arrayBuffer = await blob.arrayBuffer();
          this.result = arrayBuffer;
          if (this.onload) {
            this.onload({} as ProgressEvent);
          }
        } catch (error) {
          this.error = error as Error;
          if (this.onerror) {
            this.onerror({} as ProgressEvent);
          }
        }
      }, 0);
    }

    readAsText(blob: Blob) {
      setTimeout(async () => {
        try {
          const text = await blob.text();
          this.result = text;
          if (this.onload) {
            this.onload({} as ProgressEvent);
          }
        } catch (error) {
          this.error = error as Error;
          if (this.onerror) {
            this.onerror({} as ProgressEvent);
          }
        }
      }, 0);
    }
  } as unknown as typeof globalThis.FileReader;
}

describe('FileValidator', () => {
  describe('validate', () => {
    describe('Basic Properties Validation', () => {
      it('should reject empty files', () => {
        const file = new File([], 'empty.csv', { type: 'text/csv' });
        const result = FileValidator.validate(file);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('File is empty');
      });

      it('should reject files exceeding max size', () => {
        const smallContent = 'x'.repeat(1024);
        const file = new File([smallContent], 'large.csv', {
          type: 'text/csv'
        });
        Object.defineProperty(file, 'size', {
          value: STORAGE_LIMITS.maxFileSize + 1024
        });
        const result = FileValidator.validate(file);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes('exceeds the limit'))).toBe(
          true
        );
      });

      it('should warn about large files approaching the limit', () => {
        const smallContent = 'x'.repeat(1024);
        const file = new File([smallContent], 'large.csv', {
          type: 'text/csv'
        });
        Object.defineProperty(file, 'size', {
          value: Math.floor(STORAGE_LIMITS.maxFileSize * 0.85)
        });
        const result = FileValidator.validate(file);

        expect(result.warnings.some((w) => w.includes('slow'))).toBe(true);
      });

      it('should reject files with invalid names', () => {
        const file = new File(['content'], '', { type: 'text/csv' });
        const result = FileValidator.validate(file);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid file name');
      });

      it('should warn about suspicious filename patterns', () => {
        const suspiciousFiles = [
          new File(['content'], '../evil.csv'),
          new File(['content'], 'file<script>.csv'),
          new File(['content'], 'file:test.csv'),
          new File(['content'], '.hidden.csv')
        ];

        suspiciousFiles.forEach((file) => {
          const result = FileValidator.validate(file);
          expect(
            result.warnings.some((w) => w.includes('unusual characters'))
          ).toBe(true);
        });
      });

      it('should detect files without dots as having no extension', () => {
        // getFileExtension returns the whole filename if no dot is present
        // which then gets rejected as unsupported extension in strict mode
        const file = new File(['content'], 'noextension', {
          type: 'text/csv'
        });
        const result = FileValidator.validate(file);

        // Will be rejected as unsupported extension, not warned about no extension
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes('not supported'))).toBe(
          true
        );
      });

      it('should reject unsupported extensions in strict mode', () => {
        const file = new File(['content'], 'file.xyz', {
          type: 'text/plain'
        });
        const result = FileValidator.validate(file);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes('not supported'))).toBe(
          true
        );
      });

      it('should warn about unrecognized MIME types', () => {
        const file = new File(['content'], 'file.csv', {
          type: 'application/x-unknown'
        });
        const result = FileValidator.validate(file);

        expect(result.warnings.some((w) => w.includes('not recognized'))).toBe(
          true
        );
      });
    });

    describe('File Type Detection', () => {
      it('should detect CSV files by extension', () => {
        const file = new File(['content'], 'data.csv', { type: 'text/csv' });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.CSV);
        expect(result.metadata?.detectedType).toBe(FileType.CSV);
      });

      it('should detect CSV files by MIME type', () => {
        const file = new File(['content'], 'data.txt', {
          type: 'text/csv'
        });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.CSV);
      });

      it('should detect TSV files', () => {
        const file = new File(['content'], 'data.tsv', {
          type: 'text/tab-separated-values'
        });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.TSV);
      });

      it('should detect GeoJSON files by extension', () => {
        const file = new File(['{}'], 'map.geojson', {
          type: 'application/geo+json'
        });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.GEOJSON);
      });

      it('should detect GeoJSON by .json extension with geo MIME', () => {
        const file = new File(['{}'], 'map.json', {
          type: 'application/geo+json'
        });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.GEOJSON);
      });

      it('should detect Shapefile components', () => {
        const shpFile = new File(['shp'], 'boundaries.shp', {
          type: 'application/x-shapefile'
        });
        const shxFile = new File(['shx'], 'boundaries.shx', {
          type: 'application/octet-stream'
        });
        const dbfFile = new File(['dbf'], 'boundaries.dbf', {
          type: 'application/x-dbf'
        });
        const prjFile = new File(['prj'], 'boundaries.prj', {
          type: 'text/plain'
        });

        expect(FileValidator.validate(shpFile).fileType).toBe(
          FileType.SHAPEFILE
        );
        expect(FileValidator.validate(shxFile).fileType).toBe(
          FileType.SHAPEFILE
        );
        expect(FileValidator.validate(dbfFile).fileType).toBe(
          FileType.SHAPEFILE
        );
        expect(FileValidator.validate(prjFile).fileType).toBe(
          FileType.SHAPEFILE
        );
      });

      it('should detect GeoPackage files', () => {
        const file = new File(['gpkg'], 'data.gpkg', {
          type: 'application/geopackage+sqlite3'
        });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.GEOPACKAGE);
      });

      it('should return UNKNOWN for unrecognized files', () => {
        const file = new File(['content'], 'unknown.xyz', {
          type: 'application/octet-stream'
        });
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.UNKNOWN);
      });
    });

    describe('Async Validation Requirements', () => {
      it('should require async validation for CSV files', () => {
        const file = new File(['content'], 'data.csv', { type: 'text/csv' });
        const result = FileValidator.validate(file);

        expect(result.requiresAsyncValidation).toBe(true);
      });

      it('should require async validation for TSV files', () => {
        const file = new File(['content'], 'data.tsv', {
          type: 'text/tab-separated-values'
        });
        const result = FileValidator.validate(file);

        expect(result.requiresAsyncValidation).toBe(true);
      });

      it('should require async validation for GeoJSON files', () => {
        const file = new File(['{}'], 'map.geojson', {
          type: 'application/geo+json'
        });
        const result = FileValidator.validate(file);

        expect(result.requiresAsyncValidation).toBe(true);
      });

      it('should require async validation for Shapefiles', () => {
        const file = new File(['shp'], 'boundaries.shp', {
          type: 'application/x-shapefile'
        });
        const result = FileValidator.validate(file);

        expect(result.requiresAsyncValidation).toBe(true);
      });

      it('should require async validation for GeoPackage', () => {
        const file = new File(['gpkg'], 'data.gpkg', {
          type: 'application/geopackage+sqlite3'
        });
        const result = FileValidator.validate(file);

        expect(result.requiresAsyncValidation).toBe(true);
      });

      it('should not require async validation for unknown types', () => {
        const file = new File(['content'], 'unknown.xyz', {
          type: 'application/octet-stream'
        });
        const result = FileValidator.validate(file);

        expect(result.requiresAsyncValidation).toBe(false);
      });
    });

    describe('Metadata Population', () => {
      it('should populate metadata with detected type', () => {
        const file = new File(['content'], 'data.csv', { type: 'text/csv' });
        const result = FileValidator.validate(file);

        expect(result.metadata).toBeDefined();
        expect(result.metadata?.detectedType).toBe(FileType.CSV);
      });

      it('should populate metadata with actual MIME type', () => {
        const file = new File(['content'], 'data.csv', {
          type: 'text/csv'
        });
        const result = FileValidator.validate(file);

        expect(result.metadata?.actualMimeType).toBe('text/csv');
      });
    });
  });

  describe('validateAsync', () => {
    describe('CSV Validation', () => {
      it('should validate valid CSV content without adding errors', async () => {
        const csvContent =
          'name,age,city\nJohn,25,Paris\nJane,30,London\nBob,35,Berlin';
        const file = new File([csvContent], 'data.csv', { type: 'text/csv' });
        const initialResult = FileValidator.validate(file);
        const initialErrorCount = initialResult.errors.length;

        const result = await FileValidator.validateAsync(file, initialResult);

        // Async validation should not add new errors for valid CSV
        expect(result.errors.length).toBe(initialErrorCount);
        expect(result.metadata?.magicNumber).toBeDefined();
        expect(result.metadata?.encoding).toBe('UTF-8');
      });

      it('should handle CSV with BOM', async () => {
        const csvContent = '\uFEFFname,age,city\nJohn,25,Paris\nJane,30,London';
        const file = new File([csvContent], 'data.csv', { type: 'text/csv' });
        const initialResult = FileValidator.validate(file);
        const result = await FileValidator.validateAsync(file, initialResult);

        expect(result.metadata?.encoding).toBe('UTF-8 with BOM');
      });

      it('should complete async validation for CSV with inconsistent columns', async () => {
        const csvContent = 'name,age\nJohn,25\nJane\nBob,35';
        const file = new File([csvContent], 'data.csv', { type: 'text/csv' });
        const initialResult = FileValidator.validate(file);
        const result = await FileValidator.validateAsync(file, initialResult);

        // Validation should complete successfully
        expect(result).toBeDefined();
        expect(result.fileType).toBe(FileType.CSV);
        // Metadata should be populated with encoding detection
        expect(result.metadata).toBeDefined();
        expect(result.metadata?.encoding).toBeDefined();
      });
    });

    describe('GeoJSON Validation', () => {
      it('should validate valid GeoJSON without adding errors', async () => {
        const geoJSON = JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
              properties: { name: 'Paris' }
            },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-0.1276, 51.5074] },
              properties: { name: 'London' }
            }
          ]
        });
        const file = new File([geoJSON], 'map.geojson', {
          type: 'application/geo+json'
        });
        const initialResult = FileValidator.validate(file);
        const initialErrorCount = initialResult.errors.length;

        const result = await FileValidator.validateAsync(file, initialResult);

        // Should not add errors for valid GeoJSON
        expect(result.errors.length).toBe(initialErrorCount);
      });

      it('should handle invalid GeoJSON in async validation', async () => {
        const invalidJSON = '{ invalid json';
        const file = new File([invalidJSON], 'map.geojson', {
          type: 'application/geo+json'
        });
        const initialResult = FileValidator.validate(file);
        const result = await FileValidator.validateAsync(file, initialResult);

        // Async validation should complete without throwing
        expect(result).toBeDefined();
        expect(result.fileType).toBe(FileType.GEOJSON);
        // The file content starts with '{' so it's detected as JSON-like
        // Invalid JSON will cause parsing error which is logged
      });
    });

    describe('Shapefile Validation', () => {
      it('should extract magic number from shapefile', async () => {
        // Shapefile magic number: 0x0000270a (9994 in decimal, big-endian)
        // Create a realistic shp header (100 bytes minimum)
        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        view.setUint32(0, 0x0000270a, false); // Magic number (big-endian)
        view.setUint32(24, 50, false); // File length

        const file = new File([buffer], 'boundaries.shp', {
          type: 'application/x-shapefile'
        });
        const initialResult = FileValidator.validate(file);
        const initialErrorCount = initialResult.errors.length;

        const result = await FileValidator.validateAsync(file, initialResult);

        expect(result.metadata?.magicNumber).toBeDefined();
        // Should not add errors for valid magic number
        expect(result.errors.length).toBe(initialErrorCount);
      });

      it('should reject invalid shapefile magic number', async () => {
        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        view.setUint32(0, 0xdeadbeef, false); // Wrong magic

        const file = new File([buffer], 'boundaries.shp', {
          type: 'application/x-shapefile'
        });
        const initialResult = FileValidator.validate(file);
        const result = await FileValidator.validateAsync(file, initialResult);

        expect(result.errors.some((e) => e.includes('signature'))).toBe(true);
      });
    });

    describe('GeoPackage Validation', () => {
      it('should extract magic number from GeoPackage', async () => {
        // SQLite magic string "SQLite format 3\0" + padding to meet minimum size
        const header = new TextEncoder().encode('SQLite format 3\0');
        const buffer = new ArrayBuffer(1024); // Minimum 1KB for geopackage
        const view = new Uint8Array(buffer);
        view.set(header, 0);

        const file = new File([buffer], 'data.gpkg', {
          type: 'application/geopackage+sqlite3'
        });
        const initialResult = FileValidator.validate(file);
        const initialErrorCount = initialResult.errors.length;

        const result = await FileValidator.validateAsync(file, initialResult);

        expect(result.metadata?.magicNumber).toBeDefined();
        // Should not add errors for valid file
        expect(result.errors.length).toBe(initialErrorCount);
      });

      it('should reject GeoPackage files that are too small', async () => {
        const smallBuffer = new Uint8Array(100);
        const file = new File([smallBuffer], 'data.gpkg', {
          type: 'application/geopackage+sqlite3'
        });
        const initialResult = FileValidator.validate(file);

        expect(initialResult.isValid).toBe(false);
        expect(initialResult.errors.some((e) => e.includes('too small'))).toBe(
          true
        );
      });
    });

    describe('Error Handling', () => {
      it('should handle file read errors gracefully', async () => {
        // Create a file that will fail to read
        const file = new File(['content'], 'data.csv', { type: 'text/csv' });
        const initialResult = FileValidator.validate(file);

        // Mock the file as closed/unreadable by creating an invalid state
        Object.defineProperty(file, 'size', { value: -1 });

        const result = await FileValidator.validateAsync(file, initialResult);

        // The error handling catches and logs the error
        // The result should still be defined and contain the initial validation
        expect(result).toBeDefined();
        expect(result.fileType).toBe(FileType.CSV);
        // Initial validation results should be preserved
        expect(result.isValid).toBe(initialResult.isValid);
      });
    });
  });

  describe('validateMultiple', () => {
    it('should validate multiple files successfully', () => {
      const files = [
        new File(['content1'], 'file1.csv', { type: 'text/csv' }),
        new File(['content2'], 'file2.csv', { type: 'text/csv' })
      ];
      const result = FileValidator.validateMultiple(files);

      expect(result.results.size).toBe(2);
      expect(result.globalErrors).toHaveLength(0);
      expect(result.isValid).toBe(true);
    });

    it('should reject when file count exceeds maximum', () => {
      const files = Array.from(
        { length: STORAGE_LIMITS.maxFileCount + 1 },
        (_, i) => new File(['content'], `file${i}.csv`, { type: 'text/csv' })
      );
      const result = FileValidator.validateMultiple(files);

      expect(
        result.globalErrors.some((e) => e.includes('Maximum number'))
      ).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should reject when total size exceeds maximum', () => {
      const smallContent = 'x'.repeat(1024);
      const file1 = new File([smallContent], 'file1.csv', { type: 'text/csv' });
      const file2 = new File([smallContent], 'file2.csv', { type: 'text/csv' });
      Object.defineProperty(file1, 'size', {
        value: Math.floor(STORAGE_LIMITS.maxTotalFileSize / 2) + 1
      });
      Object.defineProperty(file2, 'size', {
        value: Math.floor(STORAGE_LIMITS.maxTotalFileSize / 2) + 1
      });
      const files = [file1, file2];
      const result = FileValidator.validateMultiple(files);

      expect(
        result.globalErrors.some((e) => e.includes('Total file size'))
      ).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should validate shapefile groups correctly', () => {
      const files = [
        new File(['shp'], 'boundaries.shp', {
          type: 'application/x-shapefile'
        }),
        new File(['shx'], 'boundaries.shx', {
          type: 'application/octet-stream'
        }),
        new File(['dbf'], 'boundaries.dbf', { type: 'application/x-dbf' })
      ];
      const result = FileValidator.validateMultiple(files);

      expect(result.isValid).toBe(true);
    });

    it('should detect incomplete shapefile groups', () => {
      const files = [
        new File(['shp'], 'boundaries.shp', {
          type: 'application/x-shapefile'
        })
        // Missing .shx and .dbf
      ];
      const result = FileValidator.validateMultiple(files);

      expect(
        result.globalErrors.some(
          (e) => e.includes('Incomplete') || e.includes('shapefile')
        )
      ).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should return individual file validation results', () => {
      const files = [
        new File([], 'empty.csv', { type: 'text/csv' }), // Invalid
        new File(['content'], 'valid.csv', { type: 'text/csv' }) // Valid
      ];
      const result = FileValidator.validateMultiple(files);

      const emptyResult = result.results.get('empty.csv');
      const validResult = result.results.get('valid.csv');

      expect(emptyResult?.isValid).toBe(false);
      expect(validResult?.isValid).toBe(true);
      expect(result.isValid).toBe(false); // Overall invalid due to empty file
    });
  });

  describe('Configuration', () => {
    it('should use correct default configuration', () => {
      expect(FILE_VALIDATION_CONFIG.maxFileSize).toBe(
        STORAGE_LIMITS.maxFileSize
      );
      expect(FILE_VALIDATION_CONFIG.maxTotalSize).toBe(
        STORAGE_LIMITS.maxTotalFileSize
      );
      expect(FILE_VALIDATION_CONFIG.maxFileCount).toBe(
        STORAGE_LIMITS.maxFileCount
      );
      expect(FILE_VALIDATION_CONFIG.strictMode).toBe(true);
    });

    it('should include all expected file extensions', () => {
      const expectedExtensions = [
        'csv',
        'tsv',
        'txt',
        'geojson',
        'json',
        'shp',
        'shx',
        'dbf',
        'prj',
        'cpg',
        'gpkg'
      ];

      expectedExtensions.forEach((ext) => {
        expect(FILE_VALIDATION_CONFIG.allowedExtensions).toContain(ext);
      });
    });

    it('should include all expected MIME types', () => {
      const expectedMimeTypes = [
        'text/csv',
        'application/json',
        'application/geo+json',
        'application/x-shapefile',
        'application/geopackage+sqlite3'
      ];

      expectedMimeTypes.forEach((mime) => {
        expect(FILE_VALIDATION_CONFIG.allowedMimeTypes).toContain(mime);
      });
    });
  });
});
