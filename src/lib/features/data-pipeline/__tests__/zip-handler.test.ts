import { describe, expect, it } from 'vitest';
import {
  extractZip,
  getNonShapefileFilesFromArchive,
  getShapefileFilesFromArchive,
  getSupportedFilesFromArchive,
  isZipFile,
  type ExtractedFile
} from '../utils/zip-handler';
import { ZIP_TEST_FILES, loadTestFile } from './test-file-loader';

describe('ZIP Handler - isZipFile', () => {
  it('should detect ZIP files by extension', () => {
    const zipFile = loadTestFile(ZIP_TEST_FILES.SINGLE_CSV);
    expect(isZipFile(zipFile)).toBe(true);
  });

  it('should detect .zip extension regardless of MIME type', () => {
    const file = new File(['content'], 'archive.zip', {
      type: 'application/octet-stream'
    });
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

    expect(result.files.length).toBe(1);
    expect(result.files[0].name).toMatch(/\.csv$/);
    expect(result.isShapefileArchive).toBe(false);
  });

  it('should extract multiple-csv.zip', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.MULTIPLE_CSV);
    const result = await extractZip(file);

    expect(result.files.length).toBeGreaterThanOrEqual(2);
    expect(result.files.every((f) => f.name.endsWith('.csv'))).toBe(true);
    expect(result.isShapefileArchive).toBe(false);
  });

  it('should detect shapefile-complete.zip as shapefile archive', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.SHAPEFILE);
    const result = await extractZip(file);

    expect(result.isShapefileArchive).toBe(true);
    expect(result.shapefileBaseName).toBeDefined();
    expect(result.shapefileBaseName).toBeTruthy();
    expect(result.files.some((f) => f.name.endsWith('.shp'))).toBe(true);
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

    expect(supported.length).toBe(1);
    expect(supported[0].name).toMatch(/\.csv$/);
    expect(supported[0].content).toBeInstanceOf(Uint8Array);
  });

  it('should find multiple CSV files in archive', async () => {
    const file = loadTestFile(ZIP_TEST_FILES.MULTIPLE_CSV);
    const result = await extractZip(file);
    const supported = getSupportedFilesFromArchive(result.files);

    expect(supported.length).toBeGreaterThanOrEqual(2);
    expect(supported.every((f) => f.name.endsWith('.csv'))).toBe(true);
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

describe('ZIP Handler - getNonShapefileFilesFromArchive', () => {
  function createMockFile(name: string): ExtractedFile {
    return {
      name,
      path: name,
      content: new Uint8Array([])
    };
  }

  it('should include CSV with same basename as shapefile', () => {
    const files: ExtractedFile[] = [
      createMockFile('regions.shp'),
      createMockFile('regions.shx'),
      createMockFile('regions.dbf'),
      createMockFile('regions.prj'),
      createMockFile('regions.csv')
    ];

    const result = getNonShapefileFilesFromArchive(files, 'regions');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('regions.csv');
  });

  it('should include GeoJSON with same basename as shapefile', () => {
    const files: ExtractedFile[] = [
      createMockFile('data.shp'),
      createMockFile('data.shx'),
      createMockFile('data.dbf'),
      createMockFile('data.geojson')
    ];

    const result = getNonShapefileFilesFromArchive(files, 'data');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('data.geojson');
  });

  it('should exclude shapefile extensions even with same basename', () => {
    const files: ExtractedFile[] = [
      createMockFile('regions.shp'),
      createMockFile('regions.shx'),
      createMockFile('regions.dbf'),
      createMockFile('regions.prj'),
      createMockFile('regions.cpg')
    ];

    const result = getNonShapefileFilesFromArchive(files, 'regions');

    expect(result).toHaveLength(0);
  });

  it('should include files with different basename', () => {
    const files: ExtractedFile[] = [
      createMockFile('regions.shp'),
      createMockFile('regions.shx'),
      createMockFile('regions.dbf'),
      createMockFile('data.csv'),
      createMockFile('other.geojson')
    ];

    const result = getNonShapefileFilesFromArchive(files, 'regions');

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toContain('data.csv');
    expect(result.map((f) => f.name)).toContain('other.geojson');
  });

  it('should return all supported files when no shapefile basename provided', () => {
    const files: ExtractedFile[] = [
      createMockFile('data.csv'),
      createMockFile('regions.geojson'),
      createMockFile('readme.md')
    ];

    const result = getNonShapefileFilesFromArchive(files);

    expect(result.length).toBe(2);
  });

  it('should handle case-insensitive basename matching', () => {
    const files: ExtractedFile[] = [
      createMockFile('REGIONS.shp'),
      createMockFile('REGIONS.shx'),
      createMockFile('REGIONS.dbf'),
      createMockFile('regions.csv')
    ];

    const result = getNonShapefileFilesFromArchive(files, 'REGIONS');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('regions.csv');
  });
});
