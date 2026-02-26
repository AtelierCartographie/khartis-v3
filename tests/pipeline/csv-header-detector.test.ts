import { describe, expect, it } from 'vitest';
import { detectCsvHeader } from '$lib/features/data-pipeline/utils/csv-header-detector';

function asFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('detectCsvHeader', () => {
  it('retourne hasHeader=true et confidence=0 quand le fichier ne contient pas assez de lignes', async () => {
    const file = asFile('id,city\n', 'single-line.csv');

    const result = await detectCsvHeader(file, ',');

    expect(result).toEqual({
      hasHeader: true,
      confidence: 0,
      comparedColumns: 0
    });
  });

  it('retourne hasHeader=false quand les deux premières lignes ont la même structure de données', async () => {
    const file = asFile(
      [
        '1,Paris,48.8566,2.3522,2148000,France',
        '2,Berlin,52.5200,13.4050,3645000,Germany'
      ].join('\n'),
      'no-header.csv'
    );

    const result = await detectCsvHeader(file, ',');

    expect(result.hasHeader).toBe(false);
    expect(result.comparedColumns).toBe(6);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('retourne hasHeader=true quand la première ligne contient des labels textuels', async () => {
    const file = asFile(
      [
        'id,city,lat,lng,population,country',
        '1,Paris,48.8566,2.3522,2148000,France'
      ].join('\n'),
      'with-header.csv'
    );

    const result = await detectCsvHeader(file, ',');

    expect(result.hasHeader).toBe(true);
    expect(result.comparedColumns).toBe(6);
  });

  it('retourne hasHeader=true avec confidence=0 quand les colonnes des deux lignes ne correspondent pas', async () => {
    const file = asFile(
      ['id,city,population', '1,Paris,2148000,France'].join('\n'),
      'mismatch.csv'
    );

    const result = await detectCsvHeader(file, ',');

    expect(result.hasHeader).toBe(true);
    expect(result.comparedColumns).toBe(3);
    expect(result.confidence).toBe(0);
  });

  it('reconnaît les nombres entre parenthèses et les cellules quotées dans la comparaison de structure', async () => {
    const file = asFile(
      ['("1"),"2,5",Paris', '("3"),"4,1",Berlin'].join('\n'),
      'quoted-parenthesized.csv'
    );

    const result = await detectCsvHeader(file, ',');

    expect(result.hasHeader).toBe(false);
    expect(result.comparedColumns).toBe(3);
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
