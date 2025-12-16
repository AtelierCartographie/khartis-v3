import { describe, expect, it } from 'vitest';
import {
  canProcessShapefile,
  detectShapefileBaseName,
  getShapefileValidationMessage,
  isShapefileComponent,
  validateShapefileSet
} from '../utils/shapefile-validator';

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
