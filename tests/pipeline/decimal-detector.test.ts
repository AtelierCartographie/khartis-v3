import { describe, expect, it } from 'vitest';
import { detectDecimalSeparator } from '$lib/features/data-pipeline/utils/decimal-detector';

function asFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('decimal-detector', () => {
  describe('detectDecimalSeparator — delimiter detection', () => {
    it('picks semicolon delimiter on a semicolon-dominant sample', async () => {
      const file = asFile(
        ['id;city;value', '1;Paris;42', '2;Lyon;17'].join('\n')
      );
      const result = await detectDecimalSeparator(file);
      expect(result.delimiter).toBe(';');
    });

    it('falls back to comma when comma dominates', async () => {
      const file = asFile(
        ['id,city,value', '1,Paris,42', '2,Lyon,17'].join('\n')
      );
      const result = await detectDecimalSeparator(file);
      expect(result.delimiter).toBe(',');
    });

    it('detects tab delimiter for TSV', async () => {
      const file = asFile(['id\tcity\tvalue', '1\tParis\t42'].join('\n'));
      const result = await detectDecimalSeparator(file);
      expect(result.delimiter).toBe('\t');
    });
  });

  describe('detectDecimalSeparator — decimal separator', () => {
    it('returns european for comma-decimal with dot-thousands', async () => {
      const file = asFile(
        [
          'id,city,gdp,rate',
          '1,Paris,"1.234,56","2,35"',
          '2,Berlin,"789,50","1,89"',
          '3,Rome,"2.000,00","3,14"'
        ].join('\n')
      );
      const result = await detectDecimalSeparator(file);
      expect(result.separator).toBe(',');
      expect(result.thousandsSeparator).toBe('.');
    });

    it('returns standard for dot-decimal with comma-thousands', async () => {
      const file = asFile(
        [
          'id,city,gdp',
          '1,US,"1,234.56"',
          '2,UK,"789.50"',
          '3,CA,"2,000.00"'
        ].join('\n')
      );
      const result = await detectDecimalSeparator(file);
      expect(result.separator).toBe('.');
    });

    it('should detect european when comma decimals carry no thousands grouping', async () => {
      const file = asFile(
        [
          'id;city;rate',
          '1;Paris;1234,56',
          '2;Berlin;9876,5',
          '3;Rome;1234,5678'
        ].join('\n')
      );
      const result = await detectDecimalSeparator(file);
      expect(result.separator).toBe(',');
      expect(result.thousandsSeparator).toBeUndefined();
    });

    it('should stay standard when comma values have exactly 3 decimals (thousands-grouping ambiguity)', async () => {
      const file = asFile(
        ['id;city;value', '1;Paris;1234,567', '2;Berlin;9876,543'].join('\n')
      );
      const result = await detectDecimalSeparator(file);
      expect(result.separator).toBe('.');
    });

    it('stays standard when european values are below the 30% ratio', async () => {
      const rows: string[] = ['id,value'];
      for (let i = 0; i < 8; i++) rows.push(`${i},${i}.${i}0`);
      rows.push('8,3,14');
      rows.push('9,2,71');
      const file = asFile(rows.join('\n'));
      const result = await detectDecimalSeparator(file);
      expect(result.separator).toBe('.');
    });
  });
});
