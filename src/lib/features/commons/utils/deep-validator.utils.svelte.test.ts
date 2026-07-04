import { describe, expect, it } from 'vitest';
import { DeepDataValidator } from './deep-validator.utils';

describe('DeepDataValidator', () => {
  it('bounds content analysis to the requested pre-import preview size', async () => {
    const result = await DeepDataValidator.analyzeDataContent(
      ['value'],
      [[1], [99], [100]],
      { sampleSize: 1, skipGeoDetection: true }
    );

    expect(result.rowCount).toBe(1);
    expect(result.columns[0]).toMatchObject({
      min: 1,
      max: 1,
      mean: 1,
      uniqueCount: 1
    });
  });

  it('uses the configured null tokens for column statistics', async () => {
    const result = await DeepDataValidator.analyzeColumn('value', [
      '',
      'NA',
      'N/A',
      'none',
      'kept'
    ]);

    expect(result.nullCount).toBe(4);
    expect(result.uniqueCount).toBe(1);
    expect(result.sampleValues).toEqual(['kept']);
  });
});
