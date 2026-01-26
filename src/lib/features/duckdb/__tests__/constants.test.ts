import { describe, expect, it } from 'vitest';
import { CACHE_CONSTANTS, DUCK_CONST } from '../constants';

describe('DuckDB Regex Patterns', () => {
  describe('Column Validation Patterns', () => {
    it('should validate integers correctly', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('0')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('-123')).toBe(
        true
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('12.34')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('abc')).toBe(
        false
      );
    });

    it('should reject invalid integer formats', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('+123')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('1e3')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('123abc')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test(' 123 ')).toBe(
        false
      );
    });

    it('should validate doubles correctly', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('-123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('12.34')).toBe(
        true
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('-0.5')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('abc')).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('12.34.56')).toBe(
        false
      );
    });

    it('should handle edge cases for doubles', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('0.0')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('.5')).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('5.')).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('1e10')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('Infinity')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('NaN')).toBe(false);
    });

    it('should validate boolean numbers (0/1)', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test('0')).toBe(
        true
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test('1')).toBe(
        true
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test('2')).toBe(
        false
      );
    });

    it('should validate boolean strings (true/false)', () => {
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('true')
      ).toBe(true);
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('false')
      ).toBe(true);
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('TRUE')
      ).toBe(true);
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('yes')
      ).toBe(false);
    });

    it('should validate ISO 8601 dates with time', () => {
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023-01-15T14:30:00')
      ).toBe(true);
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test(
          '2023-01-15T14:30:00+02:00'
        )
      ).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023-01-15')).toBe(
        false
      );
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('01/15/2023')).toBe(
        false
      );
    });

    it('should reject invalid date formats', () => {
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023-13-01T00:00:00')
      ).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('not-a-date')).toBe(
        false
      );
      expect(
        DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023/01/15T14:30:00')
      ).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('T14:30:00')).toBe(
        false
      );
    });
  });
});
