import { describe, expect, it } from 'vitest';
import { detectCsvHeader } from './csv-header-detector';

function asFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('detectCsvHeader', () => {
  it('detects missing header when first two rows share data-like structure', async () => {
    const file = asFile(
      [
        '1,Paris,48.8566,2.3522,2148000,France',
        '2,Berlin,52.5200,13.4050,3645000,Germany'
      ].join('\n'),
      'no-header.csv'
    );

    const detection = await detectCsvHeader(file, ',');

    expect(detection.hasHeader).toBe(false);
    expect(detection.comparedColumns).toBe(6);
    expect(detection.confidence).toBeGreaterThan(0.8);
  });

  it('detects a standard header row', async () => {
    const file = asFile(
      [
        'id,city,lat,lng,population,country',
        '1,Paris,48.8566,2.3522,2148000,France'
      ].join('\n'),
      'with-header.csv'
    );

    const detection = await detectCsvHeader(file, ',');

    expect(detection.hasHeader).toBe(true);
    expect(detection.comparedColumns).toBe(6);
  });

  it('keeps header=true when column counts mismatch', async () => {
    const file = asFile(
      ['id,city,population', '1,Paris,2148000,France'].join('\n'),
      'mismatch.csv'
    );

    const detection = await detectCsvHeader(file, ',');

    expect(detection.hasHeader).toBe(true);
    expect(detection.comparedColumns).toBe(3);
    expect(detection.confidence).toBe(0);
  });
});
