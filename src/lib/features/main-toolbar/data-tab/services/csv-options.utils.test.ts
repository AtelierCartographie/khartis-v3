import { describe, expect, it } from 'vitest';
import {
  canUseThousandsSeparator,
  fromThousandsSeparatorSelectValue,
  toThousandsSeparatorSelectValue
} from './csv-options.utils';

describe('csv-options.utils', () => {
  describe('toThousandsSeparatorSelectValue', () => {
    it('maps space separator to stable select value', () => {
      expect(toThousandsSeparatorSelectValue(' ')).toBe('space');
    });

    it('maps unknown or missing value to none', () => {
      expect(toThousandsSeparatorSelectValue(undefined)).toBe('none');
      expect(toThousandsSeparatorSelectValue('')).toBe('none');
    });
  });

  describe('fromThousandsSeparatorSelectValue', () => {
    it('maps stable select value to space separator', () => {
      expect(fromThousandsSeparatorSelectValue('space')).toBe(' ');
    });

    it('maps none to undefined', () => {
      expect(fromThousandsSeparatorSelectValue('none')).toBeUndefined();
    });
  });

  describe('canUseThousandsSeparator', () => {
    it('rejects separator equal to decimal separator', () => {
      expect(canUseThousandsSeparator(',', ',')).toBe(false);
      expect(canUseThousandsSeparator('.', '.')).toBe(false);
    });

    it('allows distinct or empty separators', () => {
      expect(canUseThousandsSeparator('space', '.')).toBe(true);
      expect(canUseThousandsSeparator('none', ',')).toBe(true);
    });
  });
});
