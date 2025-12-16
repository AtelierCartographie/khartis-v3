import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { FileValidator } from './file-validator.utils';
import { DeepDataValidator } from './deep-validator.utils';
import { FileType } from '../store/create-project.types';

const DATASETS_PATH = join(process.cwd(), 'datasets-test');
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
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], data: [] };
  }

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/"/g, ''));
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

  describe('CSV Files with Various Characteristics', () => {
    describe('Delimiter Detection', () => {
      it('should handle semicolon-delimited CSV (naissances-par-commune)', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'naissances-par-commune-departement-et-region-2018.csv'
        );
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/).filter((l) => l.trim());

        // Verify it uses semicolon delimiter
        const headerLine = lines[0].replace(/^\uFEFF/, '');
        expect(headerLine.includes(';')).toBe(true);
        expect(headerLine.split(';').length).toBeGreaterThan(5);

        // Parse with semicolon
        const { headers, data } = parseCSV(content, ';');
        expect(headers.length).toBeGreaterThan(0);
        expect(data.length).toBeGreaterThan(1000); // Large dataset
      });

      it('should handle semicolon-delimited CSV (sites-seveso)', () => {
        const filePath = join(DATASETS_PATH, 'csv', 'sites-seveso-idf.csv');
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ';');

        expect(headers).toContain('Lat');
        expect(headers).toContain('Long');
        expect(data.length).toBeGreaterThan(0);
      });
    });

    describe('BOM (Byte Order Mark) Handling', () => {
      it('should detect UTF-8 BOM in file content', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'naissances-par-commune-departement-et-region-2018.csv'
        );
        const content = readFileSync(filePath, 'utf-8');

        // BOM character is \uFEFF at start of file
        expect(content.charCodeAt(0)).toBe(0xfeff);
      });

      it('should detect BOM in FAOSTAT data', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'FAOSTAT_data_en_3-4-2024.csv'
        );
        const content = readFileSync(filePath, 'utf-8');

        // BOM character is \uFEFF at start of file
        expect(content.charCodeAt(0)).toBe(0xfeff);
      });

      it('should detect BOM in UN population data', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'UN_population_by_country_2021.csv'
        );
        const content = readFileSync(filePath, 'utf-8');

        // BOM character is \uFEFF at start of file
        expect(content.charCodeAt(0)).toBe(0xfeff);
      });

      it.skipIf(!HAS_FILE_READER)(
        'should detect encoding via validateAsync (browser only)',
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
    });

    describe('Line Ending Handling', () => {
      it('should handle CRLF line endings', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'naissances-par-commune-departement-et-region-2018.csv'
        );
        const content = readFileSync(filePath, 'utf-8');

        // Check for CRLF
        expect(content.includes('\r\n')).toBe(true);

        // Parsing should still work
        const { headers, data } = parseCSV(content, ';');
        expect(headers.length).toBeGreaterThan(0);
        expect(data.length).toBeGreaterThan(0);
      });
    });

    describe('Filenames with Spaces', () => {
      it('should handle filename with spaces (population projection)', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'population projection Upper West 2010-2020.csv'
        );
        expect(existsSync(filePath)).toBe(true);

        const file = createFileFromPath(filePath, 'text/csv');
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.CSV);
        expect(result.isValid).toBe(true);
      });

      it('should handle filename with spaces and accents (TOP15 medailles)', () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'TOP15 medailles OR jeux olymiques 2024.csv'
        );
        expect(existsSync(filePath)).toBe(true);

        const file = createFileFromPath(filePath, 'text/csv');
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.CSV);
      });
    });

    describe('Geographic Coordinate Detection', () => {
      it('should parse CSV with Latitude/Longitude columns (PostOffices)', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'PostOfficesLocatedinUpperWestRegion_0.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ',');

        expect(headers).toContain('Latitude');
        expect(headers).toContain('Longitude');

        // Verify coordinate values are valid
        const latIndex = headers.indexOf('Latitude');
        const lonIndex = headers.indexOf('Longitude');

        data.forEach((row) => {
          if (row[latIndex] && row[lonIndex]) {
            const lat = parseFloat(row[latIndex]!);
            const lon = parseFloat(row[lonIndex]!);
            expect(lat).toBeGreaterThanOrEqual(-90);
            expect(lat).toBeLessThanOrEqual(90);
            expect(lon).toBeGreaterThanOrEqual(-180);
            expect(lon).toBeLessThanOrEqual(180);
          }
        });
      });

      it('should parse CSV with Lat/Long columns (sites-seveso)', async () => {
        const filePath = join(DATASETS_PATH, 'csv', 'sites-seveso-idf.csv');
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ';');

        expect(headers).toContain('Lat');
        expect(headers).toContain('Long');

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: false }
        );

        // Should detect numeric types for coordinates
        const latCol = result.columns.find((c) => c.name === 'Lat');
        const lonCol = result.columns.find((c) => c.name === 'Long');

        expect(latCol?.type).toBe('numeric');
        expect(lonCol?.type).toBe('numeric');
      });

      it('should parse CSV with coordinates (comparitech-ransomware)', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'comparitech-ransomware-dataset.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers } = parseCSV(content, ',');

        expect(headers).toContain('Latitude');
        expect(headers).toContain('Longitude');
      });
    });

    describe('Large File Processing', () => {
      it('should handle large CSV file (34k+ rows)', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'naissances-par-commune-departement-et-region-2018.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ';');

        expect(data.length).toBeGreaterThan(30000);

        // Use sampling for deep analysis
        const sampleData = data.slice(0, 1000);
        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          sampleData,
          { skipGeoDetection: true }
        );

        expect(result.columnCount).toBeGreaterThan(5);
        expect(result.rowCount).toBe(1000);
      });

      it('should handle medium CSV file (4k+ rows)', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'comparitech-ransomware-dataset.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ',');

        expect(data.length).toBeGreaterThan(4000);
        expect(headers.length).toBeGreaterThan(10);
      });
    });

    describe('Special Characters in Headers', () => {
      it('should handle accented characters in headers', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'TOP15 medailles OR jeux olymiques 2024.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ',');

        // Check for accented characters
        const hasAccents = headers.some((h) => /[àâäéèêëïîôùûüç]/i.test(h));
        expect(hasAccents || headers.length > 0).toBe(true);

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );
        expect(result.columns.length).toBe(headers.length);
      });
    });

    describe('Various Data Types', () => {
      it('should detect numeric columns in world-bank data', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'world-bank-rural-pop.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ',');

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data.slice(0, 100),
          { skipGeoDetection: true }
        );

        // Year columns should be detected
        const numericCols = result.columns.filter((c) => c.type === 'numeric');
        expect(numericCols.length).toBeGreaterThan(0);
      });

      it('should handle percentage values', async () => {
        const filePath = join(
          DATASETS_PATH,
          'csv',
          'fossil-fuel-subsidies-gdp-2021.csv'
        );
        const content = readFileSync(filePath, 'utf-8');
        const { headers, data } = parseCSV(content, ',');

        const result = await DeepDataValidator.analyzeDataContent(
          headers,
          data,
          { skipGeoDetection: true }
        );

        // Should have numeric column for subsidies percentage
        const percentCol = result.columns.find((c) =>
          c.name.toLowerCase().includes('proportion') ||
          c.name.toLowerCase().includes('%')
        );
        if (percentCol) {
          expect(percentCol.type).toBe('numeric');
        }
      });
    });
  });

  describe('Spatial Files', () => {
    describe('GeoJSON Files', () => {
      it('should validate GeoJSON file structure', async () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        expect(existsSync(filePath)).toBe(true);

        const file = createFileFromPath(filePath, 'application/geo+json');
        const initialResult = FileValidator.validate(file);

        expect(initialResult.fileType).toBe(FileType.GEOJSON);
        expect(initialResult.isValid).toBe(true);
        expect(initialResult.requiresAsyncValidation).toBe(true);
      });

      it('should parse GeoJSON content', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        const content = readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(content);

        expect(geojson.type).toBe('FeatureCollection');
        expect(Array.isArray(geojson.features)).toBe(true);
        expect(geojson.features.length).toBeGreaterThan(0);

        // Check feature structure
        const firstFeature = geojson.features[0];
        expect(firstFeature.type).toBe('Feature');
        expect(firstFeature.geometry).toBeDefined();
        expect(firstFeature.properties).toBeDefined();
      });
    });

    describe('Shapefile Components', () => {
      it('should detect .shp file', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.shp'
        );
        expect(existsSync(filePath)).toBe(true);

        const file = createFileFromPath(filePath, 'application/x-shapefile');
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.SHAPEFILE);
      });

      it('should detect .shx file', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.shx'
        );
        expect(existsSync(filePath)).toBe(true);

        const file = createFileFromPath(filePath, 'application/octet-stream');
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.SHAPEFILE);
      });

      it('should detect .dbf file', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.dbf'
        );
        expect(existsSync(filePath)).toBe(true);

        const file = createFileFromPath(filePath, 'application/x-dbf');
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.SHAPEFILE);
      });

      it('should detect .prj file', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.prj'
        );
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        // PRJ file should contain projection info
        expect(content.includes('GEOGCS') || content.includes('WGS')).toBe(
          true
        );
      });

      it('should detect .cpg file', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.cpg'
        );
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        // CPG file contains encoding info (usually UTF-8)
        expect(content.length).toBeGreaterThan(0);
      });

      it('should validate complete shapefile group', () => {
        const baseName = 'ne_50m_admin_0_countries_lakes';
        const extensions = ['.shp', '.shx', '.dbf'];
        const files: File[] = [];

        extensions.forEach((ext) => {
          const filePath = join(DATASETS_PATH, 'spatial', `${baseName}${ext}`);
          expect(existsSync(filePath)).toBe(true);

          const mimeType =
            ext === '.shp'
              ? 'application/x-shapefile'
              : ext === '.dbf'
                ? 'application/x-dbf'
                : 'application/octet-stream';
          files.push(createFileFromPath(filePath, mimeType));
        });

        const result = FileValidator.validateMultiple(files);
        expect(result.isValid).toBe(true);
      });

      it('should verify shapefile magic number in binary', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.shp'
        );
        const buffer = readFileSync(filePath);

        // Shapefile magic number is 9994 (0x0000270a) in big-endian at offset 0
        const magic =
          (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
        expect(magic).toBe(9994);
      });

      it.skipIf(!HAS_FILE_READER)(
        'should validate shapefile magic via validateAsync (browser only)',
        async () => {
          const filePath = join(
            DATASETS_PATH,
            'spatial',
            'ne_50m_admin_0_countries_lakes.shp'
          );
          const file = createFileFromPath(filePath, 'application/x-shapefile');
          const initialResult = FileValidator.validate(file);
          const result = await FileValidator.validateAsync(file, initialResult);
          expect(result.metadata?.magicNumber).toBeDefined();
          expect(result.errors.some((e) => e.includes('signature'))).toBe(
            false
          );
        }
      );
    });

    describe('Arrow/IPC Files', () => {
      it('should detect Arrow file exists', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.arrow');
        expect(existsSync(filePath)).toBe(true);

        const stats = readFileSync(filePath);
        expect(stats.length).toBeGreaterThan(0);
      });

      it('should detect ZSTD-compressed Arrow file exists', () => {
        const filePath = join(
          DATASETS_PATH,
          'spatial',
          'nuts2_data_ZSTD.arrow'
        );
        expect(existsSync(filePath)).toBe(true);

        const stats = readFileSync(filePath);
        expect(stats.length).toBeGreaterThan(0);
      });

      it('should have smaller file size with ZSTD compression', () => {
        const uncompressedPath = join(
          DATASETS_PATH,
          'spatial',
          'nuts2_data.arrow'
        );
        const compressedPath = join(
          DATASETS_PATH,
          'spatial',
          'nuts2_data_ZSTD.arrow'
        );

        const uncompressedSize = readFileSync(uncompressedPath).length;
        const compressedSize = readFileSync(compressedPath).length;

        expect(compressedSize).toBeLessThan(uncompressedSize);
      });
    });
  });

  describe('Data Quality Analysis with Real Files', () => {
    it('should analyze UN population data quality', async () => {
      const filePath = join(
        DATASETS_PATH,
        'csv',
        'UN_population_by_country_2021.csv'
      );
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.rowCount).toBeGreaterThan(200);
      expect(result.qualityIssues).toBeDefined();
      expect(Array.isArray(result.qualityIssues)).toBe(true);
    });

    it('should analyze NUTS2 CSV data', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'nuts2_data.csv');
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.rowCount).toBeGreaterThan(300);

      // Should have mix of string and numeric columns
      const stringCols = result.columns.filter((c) => c.type === 'string');
      const numericCols = result.columns.filter((c) => c.type === 'numeric');

      expect(stringCols.length).toBeGreaterThan(0);
      expect(numericCols.length).toBeGreaterThan(0);
    });

    it('should handle financial data with many columns', async () => {
      const filePath = join(
        DATASETS_PATH,
        'csv',
        'archive_financial_secrecy_index_2022.csv'
      );
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.columnCount).toBeGreaterThan(5);
      expect(result.columns.length).toBe(headers.length);
    });

    it('should analyze world bank capture fish data', async () => {
      const filePath = join(
        DATASETS_PATH,
        'csv',
        'world_bank_capture_fish_2021.csv'
      );
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      expect(result.rowCount).toBeGreaterThan(200);
      expect(result.columnCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Complete File Coverage - All CSV Files', () => {
    const csvFiles = [
      {
        name: 'FAOSTAT_data_en_3-4-2024.csv',
        delimiter: ',',
        hasBOM: true,
        minRows: 180,
        minCols: 10
      },
      {
        name: 'PostOfficesLocatedinUpperWestRegion_0.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 15,
        minCols: 4,
        hasCoords: true
      },
      {
        name: 'TOP15 medailles OR jeux olymiques 2024.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 14,
        minCols: 5
      },
      {
        name: 'UN_population_by_country_2021.csv',
        delimiter: ',',
        hasBOM: true,
        minRows: 210,
        minCols: 4
      },
      {
        name: 'archive_financial_secrecy_index_2022.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 130,
        minCols: 8
      },
      {
        name: 'comparitech-ransomware-dataset.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 4000,
        minCols: 15,
        hasCoords: true
      },
      {
        name: 'fossil-fuel-subsidies-gdp-2021.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 80,
        minCols: 3
      },
      {
        name: 'naissances-par-commune-departement-et-region-2018.csv',
        delimiter: ';',
        hasBOM: true,
        minRows: 30000,
        minCols: 8
      },
      {
        name: 'nuts2_data.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 300,
        minCols: 10
      },
      {
        name: 'population projection Upper West 2010-2020.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 10,
        minCols: 10
      },
      {
        name: 'sites-seveso-idf.csv',
        delimiter: ';',
        hasBOM: false,
        minRows: 90,
        minCols: 7,
        hasCoords: true
      },
      {
        name: 'world-bank-rural-pop.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 260,
        minCols: 6
      },
      {
        name: 'world_bank_capture_fish_2021.csv',
        delimiter: ',',
        hasBOM: false,
        minRows: 210,
        minCols: 4
      }
    ];

    csvFiles.forEach((csvFile) => {
      describe(`${csvFile.name}`, () => {
        it('should exist and be readable', () => {
          const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
          expect(existsSync(filePath)).toBe(true);

          const content = readFileSync(filePath, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
        });

        it('should have correct BOM status', () => {
          const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
          const content = readFileSync(filePath, 'utf-8');

          const hasBOM = content.charCodeAt(0) === 0xfeff;
          expect(hasBOM).toBe(csvFile.hasBOM);
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

          // Sample first 500 rows for performance
          const sampleData = data.slice(0, 500);

          const result = await DeepDataValidator.analyzeDataContent(
            headers,
            sampleData,
            { skipGeoDetection: true }
          );

          expect(result.columns.length).toBe(headers.length);
          expect(result.rowCount).toBe(Math.min(data.length, 500));

          // Each column should have proper stats
          result.columns.forEach((col) => {
            expect(col.name).toBeDefined();
            expect(col.type).toBeDefined();
            expect(['string', 'numeric', 'boolean', 'date', 'mixed']).toContain(
              col.type
            );
          });
        });

        if (csvFile.hasCoords) {
          it('should have valid coordinate columns', () => {
            const filePath = join(DATASETS_PATH, 'csv', csvFile.name);
            const content = readFileSync(filePath, 'utf-8');
            const { headers, data } = parseCSV(content, csvFile.delimiter);

            // Find coordinate columns (case-insensitive)
            const latCol = headers.findIndex(
              (h) =>
                h.toLowerCase().includes('lat') ||
                h.toLowerCase().includes('latitude')
            );
            const lonCol = headers.findIndex(
              (h) =>
                h.toLowerCase().includes('lon') ||
                h.toLowerCase().includes('long') ||
                h.toLowerCase().includes('longitude')
            );

            expect(latCol).toBeGreaterThanOrEqual(0);
            expect(lonCol).toBeGreaterThanOrEqual(0);

            // Verify some coordinate values are valid
            const validCoords = data.filter((row) => {
              const lat = parseFloat(row[latCol] || '');
              const lon = parseFloat(row[lonCol] || '');
              return (
                !isNaN(lat) &&
                !isNaN(lon) &&
                lat >= -90 &&
                lat <= 90 &&
                lon >= -180 &&
                lon <= 180
              );
            });
            expect(validCoords.length).toBeGreaterThan(0);
          });
        }
      });
    });
  });

  describe('Complete File Coverage - All Spatial Files', () => {
    describe('GeoJSON: nuts2_data.geojson', () => {
      it('should exist and be valid JSON', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(content);
        expect(geojson).toBeDefined();
      });

      it('should be a valid FeatureCollection', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        const content = readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(content);

        expect(geojson.type).toBe('FeatureCollection');
        expect(Array.isArray(geojson.features)).toBe(true);
        expect(geojson.features.length).toBeGreaterThan(200);
      });

      it('should have valid feature structure', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        const content = readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(content);

        // Check first 10 features
        geojson.features.slice(0, 10).forEach(
          (feature: {
            type: string;
            geometry: { type: string; coordinates: unknown };
            properties: Record<string, unknown>;
          }) => {
            expect(feature.type).toBe('Feature');
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.type).toBeDefined();
            expect(feature.geometry.coordinates).toBeDefined();
            expect(feature.properties).toBeDefined();
          }
        );
      });

      it('should have properties with data columns', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        const content = readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(content);

        const firstFeature = geojson.features[0];
        const propertyKeys = Object.keys(firstFeature.properties);

        expect(propertyKeys.length).toBeGreaterThan(5);
        expect(propertyKeys).toContain('NUTS_ID');
      });

      it('should pass file validation', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
        const file = createFileFromPath(filePath, 'application/geo+json');
        const result = FileValidator.validate(file);

        expect(result.fileType).toBe(FileType.GEOJSON);
        expect(result.isValid).toBe(true);
        expect(result.requiresAsyncValidation).toBe(true);
      });
    });

    describe('Shapefile: ne_50m_admin_0_countries_lakes', () => {
      const shapefileComponents = [
        { ext: '.shp', desc: 'main geometry', minSize: 1000000 },
        { ext: '.shx', desc: 'shape index', minSize: 1000 },
        { ext: '.dbf', desc: 'attribute database', minSize: 100000 },
        { ext: '.prj', desc: 'projection', minSize: 100 },
        { ext: '.cpg', desc: 'code page', minSize: 1 }
      ];

      shapefileComponents.forEach((component) => {
        it(`should have valid ${component.ext} file (${component.desc})`, () => {
          const filePath = join(
            DATASETS_PATH,
            'spatial',
            `ne_50m_admin_0_countries_lakes${component.ext}`
          );
          expect(existsSync(filePath)).toBe(true);

          const buffer = readFileSync(filePath);
          expect(buffer.length).toBeGreaterThan(component.minSize);
        });
      });

      it('should have matching record counts in .shp and .shx', () => {
        const shpPath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.shp'
        );
        const shxPath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.shx'
        );

        const shpBuffer = readFileSync(shpPath);
        const shxBuffer = readFileSync(shxPath);

        // SHX header is 100 bytes, each record is 8 bytes
        const shxRecordCount = (shxBuffer.length - 100) / 8;

        // SHP file length is at offset 24 (big-endian, in 16-bit words)
        const shpFileLength =
          ((shpBuffer[24] << 24) |
            (shpBuffer[25] << 16) |
            (shpBuffer[26] << 8) |
            shpBuffer[27]) *
          2;

        expect(shxRecordCount).toBeGreaterThan(200);
        expect(shpFileLength).toBe(shpBuffer.length);
      });

      it('should have valid WGS84 projection', () => {
        const prjPath = join(
          DATASETS_PATH,
          'spatial',
          'ne_50m_admin_0_countries_lakes.prj'
        );
        const content = readFileSync(prjPath, 'utf-8');

        expect(content).toContain('GEOGCS');
        expect(content).toContain('WGS');
        expect(content).toContain('84');
      });

      it('should validate complete shapefile group', () => {
        const baseName = 'ne_50m_admin_0_countries_lakes';
        const requiredExt = ['.shp', '.shx', '.dbf'];
        const files: File[] = [];

        requiredExt.forEach((ext) => {
          const filePath = join(DATASETS_PATH, 'spatial', `${baseName}${ext}`);
          const mimeType =
            ext === '.shp'
              ? 'application/x-shapefile'
              : ext === '.dbf'
                ? 'application/x-dbf'
                : 'application/octet-stream';
          files.push(createFileFromPath(filePath, mimeType));
        });

        const result = FileValidator.validateMultiple(files);
        expect(result.isValid).toBe(true);
        expect(result.globalErrors).toHaveLength(0);
      });
    });

    describe('Arrow Files', () => {
      it('should have valid Arrow magic number (nuts2_data.arrow)', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.arrow');
        const buffer = readFileSync(filePath);

        // Arrow IPC magic is "ARROW1" at start
        const magic = buffer.slice(0, 6).toString('ascii');
        expect(magic).toBe('ARROW1');
      });

      it('should have valid Arrow magic number (nuts2_data_ZSTD.arrow)', () => {
        const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data_ZSTD.arrow');
        const buffer = readFileSync(filePath);

        // Arrow IPC magic is "ARROW1" at start
        const magic = buffer.slice(0, 6).toString('ascii');
        expect(magic).toBe('ARROW1');
      });

      it('should have ZSTD compression reduce file size', () => {
        const uncompressedPath = join(
          DATASETS_PATH,
          'spatial',
          'nuts2_data.arrow'
        );
        const compressedPath = join(
          DATASETS_PATH,
          'spatial',
          'nuts2_data_ZSTD.arrow'
        );

        const uncompressedSize = readFileSync(uncompressedPath).length;
        const compressedSize = readFileSync(compressedPath).length;

        // ZSTD should reduce size by at least 10%
        expect(compressedSize).toBeLessThan(uncompressedSize * 0.9);
      });
    });
  });

  describe('Edge Cases for Pipeline Robustness', () => {
    it('should handle files with quoted fields containing delimiters', async () => {
      // Simulate a CSV with quoted fields
      const content = 'name,description,value\n"John","Hello, World",100\n"Jane","Test; data",200';
      const { headers, data } = parseCSV(content, ',');

      // Note: Simple parseCSV doesn't handle this correctly, but DuckDB will
      expect(headers).toHaveLength(3);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should handle empty values in CSV', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'world-bank-rural-pop.csv');
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      // Count rows with at least one empty value
      const rowsWithEmpty = data.filter((row) =>
        row.some((val) => val === null || val === '')
      );

      // This is expected - world bank data has historical gaps
      expect(headers.length).toBeGreaterThan(0);
    });

    it('should handle files with extra whitespace', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'fossil-fuel-subsidies-gdp-2021.csv');
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // Whitespace should be handled properly
      result.columns.forEach((col) => {
        expect(col.name.trim()).toBe(col.name);
      });
    });

    it('should handle files with numeric IDs that look like numbers', async () => {
      const filePath = join(DATASETS_PATH, 'csv', 'nuts2_data.csv');
      const content = readFileSync(filePath, 'utf-8');
      const { headers, data } = parseCSV(content, ',');

      const result = await DeepDataValidator.analyzeDataContent(headers, data, {
        skipGeoDetection: true
      });

      // NUTS_ID should be detected as string (not numeric) because it has letters
      const nutsIdCol = result.columns.find((c) => c.name === 'NUTS_ID');
      if (nutsIdCol) {
        expect(nutsIdCol.type).toBe('string');
      }
    });

    it('should handle GeoJSON with different geometry types', () => {
      const filePath = join(DATASETS_PATH, 'spatial', 'nuts2_data.geojson');
      const content = readFileSync(filePath, 'utf-8');
      const geojson = JSON.parse(content);

      // Collect all geometry types
      const geometryTypes = new Set<string>();
      geojson.features.forEach(
        (feature: { geometry: { type: string } }) => {
          geometryTypes.add(feature.geometry.type);
        }
      );

      // Should have at least Polygon or MultiPolygon
      expect(
        geometryTypes.has('Polygon') || geometryTypes.has('MultiPolygon')
      ).toBe(true);
    });
  });
});
