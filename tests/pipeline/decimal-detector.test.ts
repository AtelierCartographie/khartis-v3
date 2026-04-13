import { describe, expect, it } from 'vitest';
import { detectDecimalSeparator } from '$lib/features/data-pipeline/utils/decimal-detector';

function asFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('detectDecimalSeparator', () => {
  it('détecte le format décimal européen avec point comme séparateur de milliers', async () => {
    const file = asFile(
      [
        'id,city,gdp_billion,growth_rate,temperature',
        '1,Paris,"789,50","2,35","18,5"',
        '2,Berlin,"1.234,75","1,89","15,2"'
      ].join('\n'),
      'european.csv'
    );

    const result = await detectDecimalSeparator(file);

    expect(result.separator).toBe(',');
    expect(result.delimiter).toBe(',');
    expect(result.thousandsSeparator).toBe('.');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("n'applique pas de séparateur de milliers quand les formats décimaux sont mixtes", async () => {
    const file = asFile(
      [
        'id,city,gdp_billion,growth_rate,temperature',
        '1,Paris,"789,50","2,35",18.5',
        '2,Berlin,"1.234,75","1,89",15.2'
      ].join('\n'),
      'mixed-decimals.csv'
    );

    const result = await detectDecimalSeparator(file);

    expect(result.separator).toBe(',');
    expect(result.thousandsSeparator).toBeUndefined();
  });

  it('détecte le délimiteur tabulation', async () => {
    const file = asFile(
      ['id\tcity\tvalue', '1\tParis\t12.5', '2\tBerlin\t42.0'].join('\n'),
      'tabular.tsv'
    );

    const result = await detectDecimalSeparator(file);

    expect(result.delimiter).toBe('\t');
    expect(result.separator).toBe('.');
  });

  it('détecte le séparateur de milliers espace pour les entiers sans partie décimale', async () => {
    const file = asFile(
      [
        'ville,population,superficie_km2',
        'Paris,2 161 000,105',
        'Lyon,513 000,48',
        'Marseille,861 000,241'
      ].join('\n'),
      'test-csv-options-thousands.csv'
    );

    const result = await detectDecimalSeparator(file);

    expect(result.separator).toBe('.');
    expect(result.thousandsSeparator).toBe(' ');
  });

  it("retourne les valeurs par défaut quand le fichier ne contient que l'en-tête", async () => {
    const file = asFile('id,city,value\n', 'header-only.csv');

    const result = await detectDecimalSeparator(file);

    expect(result.separator).toBe('.');
    expect(result.delimiter).toBe(',');
    expect(result.sampleSize).toBe(0);
    expect(result.thousandsSeparator).toBeUndefined();
  });

  it('détecte le séparateur de milliers virgule pour les décimaux standards', async () => {
    const file = asFile(
      ['id;value', '1;1,234.56', '2;12,345.67'].join('\n'),
      'standard-thousands.csv'
    );

    const result = await detectDecimalSeparator(file);

    expect(result.separator).toBe('.');
    expect(result.delimiter).toBe(';');
    expect(result.thousandsSeparator).toBe(',');
  });

  it('détecte le séparateur de milliers espace pour les décimaux européens cohérents', async () => {
    const file = asFile(
      ['id;value', '1;"1 234,56"', '2;"12 345,67"', '3;"123 456,78"'].join(
        '\n'
      ),
      'eu-space-thousands.csv'
    );

    const result = await detectDecimalSeparator(file);

    expect(result.separator).toBe(',');
    expect(result.delimiter).toBe(';');
    expect(result.thousandsSeparator).toBe(' ');
  });

  it('retourne une configuration sûre par défaut si la lecture du fichier échoue', async () => {
    const faultyFile = {
      size: 1024,
      slice: () => ({
        text: async () => {
          throw new Error('io error');
        }
      })
    } as unknown as File;

    const result = await detectDecimalSeparator(faultyFile);

    expect(result).toEqual({
      separator: '.',
      confidence: 0,
      sampleSize: 0,
      delimiter: ','
    });
  });
});
