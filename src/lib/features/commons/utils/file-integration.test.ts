import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { FileValidator } from './file-validator.utils';
import { DeepDataValidator } from './deep-validator.utils';
import { FileType } from '../store/create-project.types';

const DATASETS_PATH = join(process.cwd(), 'tests-datasets');
const HAS_FILE_READER = typeof FileReader !== 'undefined';

function createFileFromPath(filePath: string, mimeType?: string): File {
  const buffer = readFileSync(filePath);
  const fileName = filePath.split('/').pop() || 'unknown';
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  const blob = new Blob([arrayBuffer], { type: mimeType || 'text/csv' });
  return new File([blob], fileName, { type: mimeType || 'text/csv' });
}

function parseCSV(
  content: string,
  delimiter = ','
): { headers: string[]; data: (string | null)[][] } {
  const cleanContent = content.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], data: [] };
  }

  const headers = lines[0]
    .split(delimiter)
    .map((h) => h.trim().replace(/"/g, ''));
  const data = lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    return values.map((v) => {
      const trimmed = v.trim().replace(/"/g, '');
      return trimmed === '' || trimmed === 'NULL' ? null : trimmed;
    });
  });

  return { headers, data };
}

describe('File Integration Tests', () => {
  beforeAll(() => {
    expect(existsSync(DATASETS_PATH)).toBe(true);
  });

  describe('CSV Files - Valid', () => {
    const validCSVFiles = [
      {
        name: 'fossil-fuel-subsidies-gdp-2021.csv',
        delimiter: ',',
        minRows: 50,
        minCols: 3
      },
      {
        name: 'naissances-par-commune-departement-et-region-2018.csv',
        delimiter: ';',
        minRows: 1000,
        minCols: 5,
        hasBOM: true
      },
      {
        name: 'sites-seveso-idf.csv',
        delimiter: ';',
        minRows: 50,
        minCols: 5,
        hasCoords: true
      },
      {
        name: 'world-bank-rural-pop.csv',
        delimiter: ',',
        minRows: 50,
        minCols: 3
      }
    ];

    validCSVFiles.forEach((csvFile) => {
      describe(`${csvFile.name}`, () => {
        it('should exist and be readable', () => {
          const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
          expect(existsSync(filePath)).toBe(true);

          const content = readFileSync(filePath, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
        });

        it('should parse with correct delimiter', () => {
          const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
          const content = readFileSync(filePath, 'utf-8');
          const { headers, data } = parseCSV(content, csvFile.delimiter);

          expect(headers.length).toBeGreaterThanOrEqual(csvFile.minCols);
          expect(data.length).toBeGreaterThanOrEqual(csvFile.minRows);
        });

        it('should pass file validation', () => {
          const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
          const file = createFileFromPath(filePath, 'text/csv');
          const result = FileValidator.validate(file);

          expect(result.fileType).toBe(FileType.CSV);
          expect(result.isValid).toBe(true);
        });

        it('should pass deep data validation', async () => {
          const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
          const content = readFileSync(filePath, 'utf-8');
          const { headers, data } = parseCSV(content, csvFile.delimiter);

          const sampleData = data.slice(0, 500);
          const result = await DeepDataValidator.analyzeDataContent(
            headers,
            sampleData,
            { skipGeoDetection: true }
          );

          expect(result.rowCount).toBeGreaterThan(0);
          expect(result.columnCount).toBeGreaterThanOrEqual(csvFile.minCols);
        });

        if (csvFile.hasBOM) {
          it('should have UTF-8 BOM', () => {
            const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
            const content = readFileSync(filePath, 'utf-8');
            expect(content.charCodeAt(0)).toBe(0xfeff);
          });
        }

        if (csvFile.hasCoords) {
          it('should have coordinate columns', () => {
            const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
            const content = readFileSync(filePath, 'utf-8');
            const { headers } = parseCSV(content, csvFile.delimiter);

            const hasLatLon =
              headers.some((h) => /lat/i.test(h)) &&
              headers.some((h) => /lon|lng|long/i.test(h));
            expect(hasLatLon).toBe(true);
          });
        }
      });
    });
  });

  describe('GeoJSON Files', () => {
    const geojsonFiles = [
      'lignes-du-reseau-star-de-rennes-metropole.geojson',
      'nuts2_data.geojson'
    ];

    geojsonFiles.forEach((fileName) => {
      describe(`${fileName}`, () => {
        it('should exist and be readable', () => {
          const filePath = join(DATASETS_PATH, 'geojson', fileName);
          expect(existsSync(filePath)).toBe(true);

          const content = readFileSync(filePath, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
        });

        it('should be valid JSON', () => {
          const filePath = join(DATASETS_PATH, 'geojson', fileName);
          const content = readFileSync(filePath, 'utf-8');

          const parsed = JSON.parse(content);
          expect(parsed).toBeDefined();
          expect(parsed.type).toBeDefined();
        });

        it('should have GeoJSON structure', () => {
          const filePath = join(DATASETS_PATH, 'geojson', fileName);
          const content = readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content);

          expect([
            'FeatureCollection',
            'Feature',
            'GeometryCollection'
          ]).toContain(parsed.type);

          if (parsed.type === 'FeatureCollection') {
            expect(Array.isArray(parsed.features)).toBe(true);
            expect(parsed.features.length).toBeGreaterThan(0);
          }
        });

        it('should pass file validation', () => {
          const filePath = join(DATASETS_PATH, 'geojson', fileName);
          const file = createFileFromPath(filePath, 'application/geo+json');
          const result = FileValidator.validate(file);

          expect(result.fileType).toBe(FileType.GEOJSON);
          expect(result.isValid).toBe(true);
        });
      });
    });
  });

  describe('Shapefile Components', () => {
    const shapefileDirs = ['ne_50m', 'mos_foncier_agrege_com'];

    shapefileDirs.forEach((dirName) => {
      describe(`${dirName}`, () => {
        const shpPath = join(DATASETS_PATH, 'shp', dirName);

        it('should have .shp file', () => {
          if (!existsSync(shpPath)) return;

          const files = readdirSync(shpPath);
          const hasShp = files.some((f) => f.endsWith('.shp'));
          expect(hasShp).toBe(true);
        });

        it('should have required companion files', () => {
          if (!existsSync(shpPath)) return;

          const files = readdirSync(shpPath);
          const extensions = files.map((f) =>
            f.split('.').pop()?.toLowerCase()
          );

          expect(extensions).toContain('shp');
          expect(extensions).toContain('shx');
          expect(extensions).toContain('dbf');
        });

        it('should validate .shp component', () => {
          if (!existsSync(shpPath)) return;

          const files = readdirSync(shpPath);
          const shpFile = files.find((f) => f.endsWith('.shp'));

          if (shpFile) {
            const filePath = join(shpPath, shpFile);
            const file = createFileFromPath(
              filePath,
              'application/x-shapefile'
            );
            const result = FileValidator.validate(file);

            expect(result.fileType).toBe(FileType.SHAPEFILE);
          }
        });
      });
    });
  });

  describe('Async Validation (Browser only)', () => {
    it.skipIf(!HAS_FILE_READER)(
      'should detect encoding via validateAsync',
      async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'naissances-par-commune-departement-et-region-2018.csv'
        );
        const file = createFileFromPath(filePath, 'text/csv');
        const initialResult = FileValidator.validate(file);
        const result = await FileValidator.validateAsync(file, initialResult);
        expect(result.metadata?.encoding).toBe('UTF-8 with BOM');
      }
    );

    it.skipIf(!HAS_FILE_READER)(
      'should validate GeoJSON content asynchronously',
      async () => {
        const filePath = join(DATASETS_PATH, 'geojson', 'nuts2_data.geojson');
        const file = createFileFromPath(filePath, 'application/geo+json');
        const initialResult = FileValidator.validate(file);
        const result = await FileValidator.validateAsync(file, initialResult);
        expect(result.isValid).toBe(true);
      }
    );
  });
});
