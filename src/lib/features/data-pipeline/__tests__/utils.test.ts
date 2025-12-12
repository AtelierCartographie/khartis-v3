import { describe, expect, it } from 'vitest';
import {
  isGeospatialFile,
  isParquetFile,
  isTabularFile,
  PIPELINE_CONST
} from '../constants';
import {
  canProcessShapefile,
  detectShapefileBaseName,
  getShapefileValidationMessage,
  isShapefileComponent,
  validateShapefileSet
} from '../utils/shapefile-validator';
import {
  getSupportedFilesFromArchive,
  isZipFile,
  isZipFileName,
  type ExtractedFile
} from '../utils/zip-handler';

describe('Shapefile Validator', () => {
  describe('isShapefileComponent', () => {
    it('should detect required shapefile extensions', () => {
      expect(isShapefileComponent('test.shp')).toBe(true);
      expect(isShapefileComponent('test.shx')).toBe(true);
      expect(isShapefileComponent('test.dbf')).toBe(true);
    });

    it('should detect optional shapefile extensions', () => {
      expect(isShapefileComponent('test.prj')).toBe(true);
      expect(isShapefileComponent('test.cpg')).toBe(true);
    });

    it('should NOT detect non-shapefile files', () => {
      expect(isShapefileComponent('test.csv')).toBe(false);
      expect(isShapefileComponent('test.geojson')).toBe(false);
    });
  });

  describe('detectShapefileBaseName', () => {
    it('should detect base name from .shp file', () => {
      const files = [
        new File([], 'regions.shp'),
        new File([], 'regions.dbf'),
        new File([], 'regions.shx')
      ];
      expect(detectShapefileBaseName(files)).toBe('regions');
    });

    it('should return null if no .shp file', () => {
      const files = [new File([], 'regions.dbf'), new File([], 'regions.shx')];
      expect(detectShapefileBaseName(files)).toBe(null);
    });
  });

  describe('validateShapefileSet', () => {
    it('should validate complete shapefile set', () => {
      const files = [
        new File([], 'test.shp'),
        new File([], 'test.shx'),
        new File([], 'test.dbf'),
        new File([], 'test.prj')
      ];
      const result = validateShapefileSet(files);
      expect(result).not.toBeNull();
      expect(result?.isComplete).toBe(true);
      expect(result?.requiredMissing).toHaveLength(0);
    });

    it('should detect missing required files', () => {
      const files = [new File([], 'test.shp'), new File([], 'test.prj')];
      const result = validateShapefileSet(files);
      expect(result).not.toBeNull();
      expect(result?.isComplete).toBe(false);
      expect(result?.requiredMissing).toContain('.shx');
      expect(result?.requiredMissing).toContain('.dbf');
    });

    it('should return null for non-shapefile sets', () => {
      const files = [new File([], 'test.csv'), new File([], 'data.json')];
      expect(validateShapefileSet(files)).toBeNull();
    });
  });

  describe('canProcessShapefile', () => {
    it('should return true for complete shapefile', () => {
      const validation = {
        isComplete: true,
        baseName: 'test',
        presentFiles: ['.shp', '.shx', '.dbf'],
        requiredMissing: [],
        optionalMissing: ['.prj'],
        hasMinimumRequired: true
      };
      expect(canProcessShapefile(validation)).toBe(true);
    });

    it('should return false for incomplete shapefile', () => {
      const validation = {
        isComplete: false,
        baseName: 'test',
        presentFiles: ['.shp'],
        requiredMissing: ['.shx', '.dbf'],
        optionalMissing: ['.prj'],
        hasMinimumRequired: true
      };
      expect(canProcessShapefile(validation)).toBe(false);
    });
  });

  describe('getShapefileValidationMessage', () => {
    it('should return info for complete shapefile', () => {
      const validation = {
        isComplete: true,
        baseName: 'test',
        presentFiles: ['.shp', '.shx', '.dbf'],
        requiredMissing: [],
        optionalMissing: [],
        hasMinimumRequired: true
      };
      const message = getShapefileValidationMessage(validation);
      expect(message.type).toBe('info');
    });

    it('should return warning for incomplete shapefile', () => {
      const validation = {
        isComplete: false,
        baseName: 'test',
        presentFiles: ['.shp'],
        requiredMissing: ['.shx', '.dbf'],
        optionalMissing: [],
        hasMinimumRequired: true
      };
      const message = getShapefileValidationMessage(validation);
      expect(message.type).toBe('warning');
    });
  });
});

describe('ZIP Handler', () => {
  describe('isZipFile / isZipFileName', () => {
    it('should detect ZIP files', () => {
      expect(isZipFile(new File([], 'test.zip'))).toBe(true);
      expect(isZipFile(new File([], 'test.ZIP'))).toBe(true);
      expect(isZipFile(new File([], 'test.csv'))).toBe(false);
      expect(isZipFileName('archive.zip')).toBe(true);
      expect(isZipFileName('ARCHIVE.ZIP')).toBe(true);
      expect(isZipFileName('data.csv')).toBe(false);
    });
  });

  describe('getSupportedFilesFromArchive', () => {
    it('should filter supported files', () => {
      const files: ExtractedFile[] = [
        { name: 'data.csv', path: 'data.csv', content: new Uint8Array() },
        { name: 'map.geojson', path: 'map.geojson', content: new Uint8Array() },
        { name: 'readme.md', path: 'readme.md', content: new Uint8Array() },
        { name: 'data.gpkg', path: 'data.gpkg', content: new Uint8Array() }
      ];
      const supported = getSupportedFilesFromArchive(files);
      expect(supported).toHaveLength(3);
      expect(supported.map((f) => f.name)).toContain('data.csv');
      expect(supported.map((f) => f.name)).toContain('map.geojson');
      expect(supported.map((f) => f.name)).toContain('data.gpkg');
      expect(supported.map((f) => f.name)).not.toContain('readme.md');
    });

    it('should support all expected formats', () => {
      const formats = [
        '.csv', '.tsv', '.txt', '.json', '.geojson', '.parquet',
        '.geoparquet', '.arrow', '.gpkg', '.kml', '.kmz', '.gpx'
      ];
      const files: ExtractedFile[] = formats.map((ext) => ({
        name: `file${ext}`,
        path: `file${ext}`,
        content: new Uint8Array()
      }));
      const supported = getSupportedFilesFromArchive(files);
      expect(supported).toHaveLength(formats.length);
    });
  });
});

describe('Format Detection Matrix', () => {
  const testCases = [
    { name: 'test.csv', tabular: true, geo: false, parquet: false, supported: true },
    { name: 'test.tsv', tabular: true, geo: false, parquet: false, supported: true },
    { name: 'test.txt', tabular: true, geo: false, parquet: false, supported: true },
    { name: 'test.geojson', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.json', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.gpkg', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.gpx', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.kml', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.kmz', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.parquet', tabular: true, geo: false, parquet: true, supported: true },
    { name: 'test.geoparquet', tabular: false, geo: false, parquet: true, supported: true },
    { name: 'test.arrow', tabular: true, geo: false, parquet: false, supported: true },
    { name: 'test.shp', tabular: false, geo: true, parquet: false, supported: true },
    { name: 'test.zip', tabular: false, geo: false, parquet: false, supported: true },
    { name: 'test.unknown', tabular: false, geo: false, parquet: false, supported: false },
    { name: 'test.exe', tabular: false, geo: false, parquet: false, supported: false },
    { name: 'test.doc', tabular: false, geo: false, parquet: false, supported: false }
  ];

  for (const { name, tabular, geo, parquet, supported } of testCases) {
    it(`should correctly classify ${name}`, () => {
      const ext = '.' + name.split('.').pop();
      expect(isTabularFile(name)).toBe(tabular);
      expect(isGeospatialFile(name)).toBe(geo);
      expect(isParquetFile(name)).toBe(parquet);
      expect(PIPELINE_CONST.EXTENSIONS.ALL.includes(ext as never)).toBe(supported);
    });
  }
});
