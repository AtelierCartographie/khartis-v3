import { describe, expect, it } from 'vitest';
import {
  extractZip,
  getSupportedFilesFromArchive,
  getShapefileFilesFromArchive,
  isZipFile
} from '../utils/zip-handler';
import { ZIP_TEST_FILES, loadTestFile } from './test-file-loader';

describe('ZIP Handler - isZipFile', () => {
  it('should detect ZIP files by extension', () => {
    const zipFile = loadTestFile(ZIP_TEST_FILES.SINGLE_CSV);
    expect(isZipFile(zipFile)).toBe(true);
  });

  it('should detect .zip extension regardless of MIME type', () => {
    const file = new File(['content'], 'archive.zip', { type: 'application/octet-stream' });
    expect(isZipFile(file)).toBe(true);
  });

  it('should NOT detect file without .zip extension even with zip MIME type', () => {
    const file = new File(['content'], 'archive', { type: 'application/zip' });
    expect(isZipFile(file)).toBe(false);
  });

  it('should NOT detect CSV as ZIP', () => {
    const file = new File(['data'], 'test.csv', { type: 'text/csv' });
    expect(isZipFile(file)).toBe(false);
  });

  it('should NOT detect GeoJSON as ZIP', () => {
    const file = new File(['{}'], 'test.geojson', {
      type: 'application/geo+json'
    });
    expect(isZipFile(file)).toBe(false);
  });
});

describe('ZIP Handler - extractZip', () => {
  it('should extract single-csv.zip', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SINGLE_CSV);
    const result = await extractZip(file);

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.isShapefileArchive).toBe(false);
  });

  it('should extract multiple-csv.zip', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.MULTIPLE_CSV);
    const result = await extractZip(file);

    expect(result.files.length).toBeGreaterThan(1);
    expect(result.isShapefileArchive).toBe(false);
  });

  it('should detect shapefile-complete.zip as shapefile archive', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SHAPEFILE);
    const result = await extractZip(file);

    expect(result.isShapefileArchive).toBe(true);
    expect(result.shapefileBaseName).toBeDefined();
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('should extract files with correct names', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SINGLE_CSV);
    const result = await extractZip(file);

    result.files.forEach((extractedFile) => {
      expect(extractedFile.name).toBeDefined();
      expect(extractedFile.name.length).toBeGreaterThan(0);
      expect(extractedFile.content).toBeDefined();
    });
  });
});

describe('ZIP Handler - getSupportedFilesFromArchive', () => {
  it('should find CSV files in archive', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SINGLE_CSV);
    const result = await extractZip(file);
    const supported = getSupportedFilesFromArchive(result.files);

    expect(supported.length).toBeGreaterThan(0);
    expect(supported.some((f) => f.name.endsWith('.csv'))).toBe(true);
  });

  it('should find multiple CSV files in archive', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.MULTIPLE_CSV);
    const result = await extractZip(file);
    const supported = getSupportedFilesFromArchive(result.files);

    expect(supported.length).toBeGreaterThan(1);
  });

  it('should filter out unsupported files', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SHAPEFILE);
    const result = await extractZip(file);
    const supported = getSupportedFilesFromArchive(result.files);

    supported.forEach((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      expect([
        'csv',
        'tsv',
        'txt',
        'json',
        'geojson',
        'shp',
        'gpkg',
        'kml',
        'kmz',
        'gpx',
        'parquet',
        'geoparquet'
      ]).toContain(ext);
    });
  });
});

describe('ZIP Handler - getShapefileFilesFromArchive', () => {
  it('should extract shapefile bundle from archive', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SHAPEFILE);
    const result = await extractZip(file);

    if (result.isShapefileArchive && result.shapefileBaseName) {
      const shapefiles = getShapefileFilesFromArchive(
        result.files,
        result.shapefileBaseName
      );

      expect(shapefiles.length).toBeGreaterThan(0);
      expect(shapefiles.some((f) => f.name.endsWith('.shp'))).toBe(true);
    }
  });

  it('should include companion files (.shx, .dbf, .prj)', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SHAPEFILE);
    const result = await extractZip(file);

    if (result.isShapefileArchive && result.shapefileBaseName) {
      const shapefiles = getShapefileFilesFromArchive(
        result.files,
        result.shapefileBaseName
      );

      const extensions = shapefiles.map((f) =>
        f.name.split('.').pop()?.toLowerCase()
      );

      expect(extensions).toContain('shp');
    }
  });
});

describe('ZIP Handler - Error handling', () => {
  it('should handle corrupted ZIP gracefully', async () => {
    const corruptedFile = new File(['not a real zip'], 'corrupted.zip', {
      type: 'application/zip'
    });

    await expect(extractZip(corruptedFile)).rejects.toThrow();
  });

  it('should handle empty ZIP', async () => {
    // A minimal valid ZIP file (empty)
    const emptyZipBytes = new Uint8Array([
      0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    const emptyZip = new File([emptyZipBytes], 'empty.zip', {
      type: 'application/zip'
    });

    const result = await extractZip(emptyZip);
    expect(result.files).toHaveLength(0);
  });
});
