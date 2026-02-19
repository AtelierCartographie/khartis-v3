import { describe, expect, it } from 'vitest';
import { detectDecimalSeparator } from './decimal-detector';

function asFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('detectDecimalSeparator', () => {
  it('detects european decimal format and dot thousands separator', async () => {
    const file = asFile(
      [
        'id,city,gdp_billion,growth_rate,temperature',
        '1,Paris,"789,50","2,35","18,5"',
        '2,Berlin,"1.234,75","1,89","15,2"'
      ].join('\n'),
      'european.csv'
    );

    const detection = await detectDecimalSeparator(file);

    expect(detection.separator).toBe(',');
    expect(detection.delimiter).toBe(',');
    expect(detection.thousandsSeparator).toBe('.');
    expect(detection.confidence).toBeGreaterThan(0);
  });

  it('does not auto-apply thousands separator on mixed decimal formats', async () => {
    const file = asFile(
      [
        'id,city,gdp_billion,growth_rate,temperature',
        '1,Paris,"789,50","2,35",18.5',
        '2,Berlin,"1.234,75","1,89",15.2'
      ].join('\n'),
      'mixed-decimals.csv'
    );

    const detection = await detectDecimalSeparator(file);

    expect(detection.separator).toBe(',');
    expect(detection.thousandsSeparator).toBeUndefined();
  });

  it('detects tab delimiter', async () => {
    const file = asFile(
      ['id\tcity\tvalue', '1\tParis\t12.5', '2\tBerlin\t42.0'].join('\n'),
      'tabular.tsv'
    );

    const detection = await detectDecimalSeparator(file);

    expect(detection.delimiter).toBe('\t');
    expect(detection.separator).toBe('.');
  });

  it('returns defaults when no data rows exist', async () => {
    const file = asFile('id,city,value\n', 'header-only.csv');

    const detection = await detectDecimalSeparator(file);

    expect(detection.separator).toBe('.');
    expect(detection.delimiter).toBe(',');
    expect(detection.sampleSize).toBe(0);
    expect(detection.thousandsSeparator).toBeUndefined();
  });
});
