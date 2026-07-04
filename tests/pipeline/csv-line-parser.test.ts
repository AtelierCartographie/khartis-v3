import { describe, expect, it } from 'vitest';
import {
  parseCsvLine,
  unquoteCsvValue
} from '$lib/features/data-pipeline/utils/csv-line-parser';

describe('csv-line-parser', () => {
  it('keeps delimiters inside quoted values', () => {
    expect(parseCsvLine('id,"Paris, France",42', ',')).toEqual([
      'id',
      '"Paris, France"',
      '42'
    ]);
  });

  it('supports non-comma delimiters', () => {
    expect(parseCsvLine('id;"1,23";Paris', ';')).toEqual([
      'id',
      '"1,23"',
      'Paris'
    ]);
  });

  it('strips surrounding quote markers consistently', () => {
    expect(unquoteCsvValue('"1,23"')).toBe('1,23');
    expect(unquoteCsvValue("'Paris'")).toBe('Paris');
    expect(unquoteCsvValue('Paris')).toBe('Paris');
  });
});
