import { describe, expect, it } from 'vitest';
import { detectCsvHeader } from '$lib/features/data-pipeline/utils/csv-header-detector';

function asFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('detectCsvHeader', () => {
  it('returns hasHeader=false when row 1 is fully numeric', async () => {
    const file = asFile(['1,2,3', '4,5,6', '7,8,9'].join('\n'));
    const result = await detectCsvHeader(file, ',');
    expect(result.hasHeader).toBe(false);
  });

  it('returns hasHeader=true when row 1 is text, row 2 is numeric', async () => {
    const file = asFile(
      ['id,city,value', '1,Paris,42', '2,Lyon,17'].join('\n')
    );
    const result = await detectCsvHeader(file, ',');
    expect(result.hasHeader).toBe(true);
  });

  it('returns hasHeader=false when both rows are all-numeric (similarity >= 80%)', async () => {
    const file = asFile(
      ['1,48.8566,2.3522,2148000', '2,52.5200,13.4050,3645000'].join('\n')
    );
    const result = await detectCsvHeader(file, ',');
    expect(result.hasHeader).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('returns hasHeader=true for mixed row 1 (text + numeric)', async () => {
    const file = asFile(
      ['dep,name,pop', '01,Ain,643000', '02,Aisne,534000'].join('\n')
    );
    const result = await detectCsvHeader(file, ';');
    expect(result.hasHeader).toBe(true);
  });
});
