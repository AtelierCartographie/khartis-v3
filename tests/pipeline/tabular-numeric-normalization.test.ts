import { describe, expect, it, vi } from 'vitest';

import { normalizeFormattedNumericColumns } from '$lib/features/data-pipeline/operations/tabular-numeric-normalization';

describe('tabular numeric normalization', () => {
  it('converts fully formatted integer and decimal text columns after import', async () => {
    const duck = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          { name: 'city', type_simple: 'string' },
          { name: 'population', type_simple: 'string' },
          { name: 'temperature', type_simple: 'string' }
        ])
        .mockResolvedValueOnce([
          {
            non_empty_count: 2,
            convertible_count: 0,
            formatted_count: 0,
            decimal_like_count: 0
          }
        ])
        .mockResolvedValueOnce([
          {
            non_empty_count: 2,
            convertible_count: 2,
            formatted_count: 2,
            decimal_like_count: 0
          }
        ])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([
          {
            non_empty_count: 2,
            convertible_count: 2,
            formatted_count: 2,
            decimal_like_count: 2
          }
        ])
        .mockResolvedValueOnce(undefined)
    };

    const converted = await normalizeFormattedNumericColumns('cities', duck);

    expect(converted).toEqual(['population', 'temperature']);
    expect(duck.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('ALTER COLUMN "population" SET DATA TYPE BIGINT')
    );
    expect(duck.query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('ALTER COLUMN "temperature" SET DATA TYPE DOUBLE')
    );
  });

  it('skips candidate columns when full-column conversion is not lossless', async () => {
    const duck = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ name: 'mixed_value', type_simple: 'string' }])
        .mockResolvedValueOnce([
          {
            non_empty_count: 3,
            convertible_count: 2,
            formatted_count: 3,
            decimal_like_count: 3
          }
        ])
    };

    const converted = await normalizeFormattedNumericColumns('metrics', duck);

    expect(converted).toEqual([]);
    expect(duck.query).toHaveBeenCalledTimes(2);
  });
});
